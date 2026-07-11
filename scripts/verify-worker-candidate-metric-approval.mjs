import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for worker candidate metric approval verification.");
  process.exit(1);
}

const candidateId = "worker_metric_watch_openai_news_rss_openai_rssnewsitemsforreview";
const metricId = `approved_${candidateId}`;
const actor = "verify-worker-metric-script";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM metric WHERE id = $1", [metricId]);
    await client.query("DELETE FROM audit_log WHERE target_id = $1", [candidateId]);

    const candidateResult = await client.query(
      `
        SELECT
          id,
          entity_id,
          metric_type,
          value_number,
          value_text,
          as_of_date,
          source_id,
          source_ref,
          confidence,
          evidence_url,
          extraction_method,
          status,
          payload
        FROM candidate_metric
        WHERE id = $1
        FOR UPDATE
      `,
      [candidateId]
    );
    const candidate = candidateResult.rows[0];
    if (!candidate) throw new Error(`worker candidate metric missing: ${candidateId}`);
    if (candidate.status !== "candidate") throw new Error(`worker candidate metric should start as candidate: ${candidate.status}`);
    if (candidate.metric_type !== "rssNewsItemsForReview") throw new Error(`unexpected worker metric type: ${candidate.metric_type}`);
    if (!String(candidate.extraction_method || "").startsWith("llm_fixture")) {
      throw new Error(`worker metric should come from LLM fixture merge: ${candidate.extraction_method}`);
    }

    const parsedDocumentId = candidate.payload?.parsedDocumentId;
    if (!parsedDocumentId) throw new Error("worker metric payload missing parsedDocumentId");
    const parsedResult = await client.query(
      `
        SELECT quality, raw_document_id
        FROM parsed_document
        WHERE id = $1
      `,
      [parsedDocumentId]
    );
    const parsed = parsedResult.rows[0];
    if (!parsed) throw new Error(`parsed document missing for worker metric: ${parsedDocumentId}`);
    const rssItemCount = Number(parsed.quality?.rssItemCount || 0);
    if (!Number.isFinite(rssItemCount) || rssItemCount <= 0) {
      throw new Error(`parsed document has no RSS item count: ${rssItemCount}`);
    }

    const rawResult = await client.query("SELECT fetched_at FROM raw_document WHERE id = $1", [parsed.raw_document_id]);
    const asOfDate = rawResult.rows[0]?.fetched_at?.toISOString?.().slice(0, 10) || candidate.as_of_date;
    const editedPayload = {
      ...candidate.payload,
      note: `Reviewer converted parsed RSS item count into a public metric sample: ${rssItemCount} items.`,
      reviewSample: "worker_rss_metric_approval",
      sourceMetricType: candidate.metric_type
    };

    await client.query(
      `
        UPDATE candidate_metric
        SET
          metric_type = 'reviewedRssNewsItems',
          value_number = $2,
          value_text = NULL,
          as_of_date = $3,
          confidence = 0.740,
          payload = $4::jsonb
        WHERE id = $1
      `,
      [candidateId, rssItemCount, asOfDate, JSON.stringify(editedPayload)]
    );
    await client.query(
      `
        INSERT INTO audit_log (id, actor, action, target_type, target_id, before_payload, after_payload)
        VALUES (
          'audit_worker_candidate_metric_update',
          $2,
          'candidate_metric.update',
          'candidate_metric',
          $1,
          $3::jsonb,
          (SELECT to_jsonb(candidate_metric.*) FROM candidate_metric WHERE id = $1)
        )
      `,
      [candidateId, actor, JSON.stringify(candidate)]
    );

    const reviewedAt = new Date().toISOString();
    await client.query("UPDATE candidate_metric SET status = 'approved', reviewed_at = $2 WHERE id = $1", [candidateId, reviewedAt]);
    await client.query(
      `
        INSERT INTO metric (
          id,
          entity_id,
          metric_type,
          value_number,
          value_text,
          as_of_date,
          source_id,
          source_ref,
          confidence,
          is_estimated
        )
        SELECT
          'approved_' || id,
          entity_id,
          metric_type,
          value_number,
          value_text,
          as_of_date,
          source_id,
          source_ref,
          confidence,
          TRUE
        FROM candidate_metric
        WHERE id = $1
        ON CONFLICT (id) DO UPDATE SET
          metric_type = EXCLUDED.metric_type,
          value_number = EXCLUDED.value_number,
          value_text = EXCLUDED.value_text,
          as_of_date = EXCLUDED.as_of_date,
          source_id = EXCLUDED.source_id,
          source_ref = EXCLUDED.source_ref,
          confidence = EXCLUDED.confidence
      `,
      [candidateId]
    );
    await client.query(
      `
        INSERT INTO audit_log (id, actor, action, target_type, target_id, before_payload, after_payload)
        VALUES (
          'audit_worker_candidate_metric_approve',
          $2,
          'candidate_metric.approve',
          'candidate_metric',
          $1,
          $3::jsonb,
          (SELECT to_jsonb(candidate_metric.*) FROM candidate_metric WHERE id = $1)
        )
      `,
      [candidateId, actor, JSON.stringify({ id: candidateId, status: "candidate" })]
    );

    const approvedResult = await client.query(
      `
        SELECT entity_id, metric_type, value_number, value_text, as_of_date, source_id, source_ref, confidence, is_estimated
        FROM metric
        WHERE id = $1
      `,
      [metricId]
    );
    const approved = approvedResult.rows[0];
    if (!approved) throw new Error("approved worker metric missing");
    if (approved.entity_id !== "openai") throw new Error(`approved worker metric entity mismatch: ${approved.entity_id}`);
    if (approved.metric_type !== "reviewedRssNewsItems") {
      throw new Error(`approved worker metric type mismatch: ${approved.metric_type}`);
    }
    if (Number(approved.value_number) !== rssItemCount) {
      throw new Error(`approved worker metric value mismatch: ${approved.value_number} !== ${rssItemCount}`);
    }
    if (approved.value_text !== null) throw new Error(`approved worker metric should not keep value_text: ${approved.value_text}`);
    if (approved.source_id !== candidate.source_id) throw new Error(`approved worker metric source mismatch: ${approved.source_id}`);
    if (approved.source_ref !== candidate.source_ref) throw new Error(`approved worker metric source_ref mismatch: ${approved.source_ref}`);
    if (Number(approved.confidence) !== 0.74) throw new Error(`approved worker metric confidence mismatch: ${approved.confidence}`);
    if (approved.is_estimated !== true) throw new Error("approved worker metric should be marked estimated/review-derived");

    const auditResult = await client.query(
      "SELECT action FROM audit_log WHERE target_id = $1 AND action = ANY($2::text[]) ORDER BY action",
      [candidateId, ["candidate_metric.update", "candidate_metric.approve"]]
    );
    if (auditResult.rows.length !== 2) throw new Error(`worker candidate metric audit log incomplete: ${auditResult.rows.length}`);

    await client.query("COMMIT");
    console.log("Worker candidate metric approval flow verified:");
    console.log(`- candidate_metric: ${candidateId}`);
    console.log(`- approved_metric: ${metricId}`);
    console.log(`- reviewed_metric_type: reviewedRssNewsItems`);
    console.log(`- reviewed_value_number: ${rssItemCount}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
