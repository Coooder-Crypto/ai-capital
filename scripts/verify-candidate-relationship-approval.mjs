import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for candidate relationship approval verification.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const errors = [];

async function approveCandidateEntity(client, entityId) {
  const result = await client.query(
    `
      SELECT *
      FROM candidate_entity
      WHERE entity_id = $1
      FOR UPDATE
    `,
    [entityId]
  );
  const candidate = result.rows[0];
  if (!candidate) {
    throw new Error(`candidate_entity not found for ${entityId}`);
  }

  await client.query("UPDATE candidate_entity SET status = 'approved', reviewed_at = now() WHERE id = $1", [candidate.id]);
  await client.query(
    `
      INSERT INTO entity (
        id,
        type,
        name,
        slug,
        layer,
        description,
        website_url,
        country,
        status,
        valuation
      )
      VALUES ($1, $2, $3, $1, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        name = EXCLUDED.name,
        layer = EXCLUDED.layer,
        description = EXCLUDED.description,
        website_url = EXCLUDED.website_url,
        country = EXCLUDED.country,
        status = EXCLUDED.status,
        valuation = EXCLUDED.valuation,
        updated_at = now()
    `,
    [
      candidate.entity_id,
      candidate.type,
      candidate.name,
      candidate.layer,
      candidate.description,
      candidate.website_url,
      candidate.country,
      candidate.status_text,
      candidate.valuation
    ]
  );
}

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const relationResult = await client.query(
      `
        SELECT *
        FROM candidate_relationship
        WHERE payload ? 'sourceCandidateEntityId'
          AND payload ? 'targetCandidateEntityId'
          AND relation_type = 'published_by'
        ORDER BY id
        LIMIT 1
        FOR UPDATE
      `
    );
    const candidate = relationResult.rows[0];
    if (!candidate) {
      throw new Error("no candidate-to-candidate relationship found");
    }

    const sourceEntityId = candidate.payload.sourceCandidateEntityId;
    const targetEntityId = candidate.payload.targetCandidateEntityId;
    await approveCandidateEntity(client, sourceEntityId);
    await approveCandidateEntity(client, targetEntityId);

    const existingEntities = await client.query("SELECT id FROM entity WHERE id = ANY($1::text[])", [[sourceEntityId, targetEntityId]]);
    if (existingEntities.rows.length !== 2) {
      throw new Error(`approved candidate entities were not inserted: ${sourceEntityId}, ${targetEntityId}`);
    }

    await client.query("UPDATE candidate_relationship SET status = 'approved', reviewed_at = now() WHERE id = $1", [candidate.id]);
    await client.query(
      `
        INSERT INTO relationship (
          id,
          source_entity_id,
          target_entity_id,
          relation_type,
          confidence,
          is_inferred,
          extraction_method,
          status,
          note
        )
        VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'approved', $7)
        ON CONFLICT (id) DO UPDATE SET
          confidence = EXCLUDED.confidence,
          status = 'approved',
          note = EXCLUDED.note,
          updated_at = now()
      `,
      [
        `approved_${candidate.id}`,
        sourceEntityId,
        targetEntityId,
        candidate.relation_type,
        candidate.confidence,
        candidate.extraction_method,
        candidate.payload.note || `Approved candidate relationship from ${candidate.extraction_method}.`
      ]
    );

    const approved = await client.query(
      `
        SELECT id, source_entity_id, target_entity_id, relation_type
        FROM relationship
        WHERE id = $1
      `,
      [`approved_${candidate.id}`]
    );
    if (!approved.rows[0]) {
      throw new Error(`approved relationship not inserted for ${candidate.id}`);
    }

    await client.query("COMMIT");
    console.log("Candidate relationship approval flow verified:");
    console.log(`- candidate_relationship: ${candidate.id}`);
    console.log(`- source_entity: ${sourceEntityId}`);
    console.log(`- target_entity: ${targetEntityId}`);
    console.log(`- relation_type: ${candidate.relation_type}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : "candidate relationship approval verification failed");
} finally {
  await pool.end();
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
