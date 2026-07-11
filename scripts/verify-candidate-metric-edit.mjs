import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for candidate metric edit verification.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const candidateId = "candidate_metric_verify_edit_openai";
    const metricId = `approved_${candidateId}`;
    const beforePayload = {
      note: "Initial candidate metric note."
    };
    const afterPayload = {
      note: "Edited metric candidate uses reviewed OpenAlex works count."
    };

    await client.query("DELETE FROM metric WHERE id = $1", [metricId]);
    await client.query("DELETE FROM audit_log WHERE target_id = $1", [candidateId]);
    await client.query("DELETE FROM candidate_metric WHERE id = $1", [candidateId]);
    await client.query(
      `
        INSERT INTO candidate_metric (
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
        )
        VALUES (
          $1,
          'openai',
          'researchWorksMentioningEntity',
          5,
          NULL,
          '2026-01-01',
          'src_openalex',
          'openalex:works:openai',
          0.610,
          'https://api.openalex.org/works?search=OpenAI',
          'verify_fixture',
          'candidate',
          $2::jsonb
        )
      `,
      [candidateId, JSON.stringify(beforePayload)]
    );

    await client.query(
      `
        UPDATE candidate_metric
        SET
          metric_type = 'reviewedResearchWorks',
          value_number = 12,
          value_text = NULL,
          as_of_date = '2026-07-05',
          source_id = 'src_openalex',
          source_ref = 'openalex:works:openai:reviewed',
          confidence = 0.830,
          evidence_url = 'https://api.openalex.org/works?search=OpenAI%20large%20language%20model',
          payload = $2::jsonb
        WHERE id = $1
      `,
      [candidateId, JSON.stringify(afterPayload)]
    );
    await client.query(
      `
        INSERT INTO audit_log (id, actor, action, target_type, target_id, before_payload, after_payload)
        VALUES (
          'audit_candidate_metric_verify_edit',
          'verify-script',
          'candidate_metric.update',
          'candidate_metric',
          $1,
          $2::jsonb,
          (SELECT to_jsonb(candidate_metric.*) FROM candidate_metric WHERE id = $1)
        )
      `,
      [candidateId, JSON.stringify({ id: candidateId, payload: beforePayload })]
    );

    const edited = await client.query(
      `
        SELECT metric_type, value_number, as_of_date, source_ref, confidence, evidence_url, payload
        FROM candidate_metric
        WHERE id = $1
      `,
      [candidateId]
    );
    const editedRow = edited.rows[0];
    if (!editedRow) throw new Error("edited candidate metric missing");
    if (editedRow.metric_type !== "reviewedResearchWorks") throw new Error(`metric_type not edited: ${editedRow.metric_type}`);
    if (Number(editedRow.value_number) !== 12) throw new Error(`value_number not edited: ${editedRow.value_number}`);
    if (editedRow.as_of_date !== "2026-07-05") throw new Error(`as_of_date not edited: ${editedRow.as_of_date}`);
    if (editedRow.source_ref !== "openalex:works:openai:reviewed") throw new Error(`source_ref not edited: ${editedRow.source_ref}`);
    if (Number(editedRow.confidence) !== 0.83) throw new Error(`confidence not edited: ${editedRow.confidence}`);
    if (!String(editedRow.evidence_url || "").includes("OpenAI%20large%20language%20model")) {
      throw new Error(`evidence_url not edited: ${editedRow.evidence_url}`);
    }
    if (editedRow.payload?.note !== afterPayload.note) throw new Error("payload note not edited");

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
          'audit_candidate_metric_verify_approve',
          'verify-script',
          'candidate_metric.approve',
          'candidate_metric',
          $1,
          $2::jsonb,
          (SELECT to_jsonb(candidate_metric.*) FROM candidate_metric WHERE id = $1)
        )
      `,
      [candidateId, JSON.stringify(editedRow)]
    );

    const approved = await client.query(
      `
        SELECT metric_type, value_number, as_of_date, source_ref, confidence
        FROM metric
        WHERE id = $1
      `,
      [metricId]
    );
    const approvedRow = approved.rows[0];
    if (!approvedRow) throw new Error("approved metric missing");
    if (approvedRow.metric_type !== "reviewedResearchWorks") throw new Error("approved metric_type did not use edit");
    if (Number(approvedRow.value_number) !== 12) throw new Error("approved value_number did not use edit");
    if (approvedRow.as_of_date !== "2026-07-05") throw new Error("approved as_of_date did not use edit");
    if (approvedRow.source_ref !== "openalex:works:openai:reviewed") throw new Error("approved source_ref did not use edit");
    if (Number(approvedRow.confidence) !== 0.83) throw new Error("approved confidence did not use edit");

    const audit = await client.query(
      "SELECT action FROM audit_log WHERE target_id = $1 AND action = ANY($2::text[]) ORDER BY action",
      [candidateId, ["candidate_metric.update", "candidate_metric.approve"]]
    );
    if (audit.rows.length !== 2) throw new Error(`candidate metric audit log incomplete: ${audit.rows.length}`);

    await client.query("COMMIT");
    console.log("Candidate metric edit flow verified:");
    console.log(`- candidate_metric: ${candidateId}`);
    console.log(`- approved_metric: ${metricId}`);
    console.log("- edited_metric_type: reviewedResearchWorks");
    console.log("- edited_value_number: 12");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
