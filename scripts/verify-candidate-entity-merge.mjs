import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for candidate entity merge verification.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const errors = [];

function aliasId(entityId, alias) {
  return `alias_${entityId}_${String(alias)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)}`;
}

function uniqueAliases(...groups) {
  return groups
    .flat()
    .filter(Boolean)
    .filter((alias, index, rows) => rows.findIndex((item) => item.toLowerCase() === alias.toLowerCase()) === index);
}

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const candidateResult = await client.query(
      `
        SELECT ce.*
        FROM candidate_entity ce
        JOIN entity e ON e.id = ce.entity_id
        WHERE ce.status = 'candidate'
        ORDER BY ce.id
        LIMIT 1
        FOR UPDATE
      `
    );
    const candidate = candidateResult.rows[0];
    if (!candidate) {
      throw new Error("no candidate entity matching an existing entity found");
    }

    const targetEntityId = candidate.entity_id;
    const reviewedAt = new Date().toISOString();
    const aliases = [candidate.name, ...(candidate.aliases || [])].filter(Boolean);
    const mergeFieldPolicy = {
      name: {
        choice: "target",
        candidateValue: candidate.name,
        targetValue: targetEntityId
      },
      country: {
        choice: "manual",
        manualValue: "Policy Test Country",
        candidateValue: candidate.country || "N/A",
        targetValue: "N/A"
      },
      aliases: {
        choice: "candidate",
        candidateValue: aliases.join(", "),
        targetValue: "N/A"
      }
    };
    const mergedPayload = {
      ...(candidate.payload || {}),
      mergeAction: "merged_into_existing_entity",
      mergeTargetEntityId: targetEntityId,
      mergedAt: reviewedAt,
      mergeFieldPolicy
    };

    await client.query("UPDATE candidate_entity SET status = 'approved', reviewed_at = $2, payload = $3::jsonb WHERE id = $1", [
      candidate.id,
      reviewedAt,
      JSON.stringify(mergedPayload)
    ]);

    for (const alias of aliases) {
      await client.query(
        `
          INSERT INTO entity_alias (id, entity_id, alias, alias_type, source_id)
          VALUES ($1, $2, $3, 'candidate_merge', NULL)
          ON CONFLICT DO NOTHING
        `,
        [aliasId(targetEntityId, alias), targetEntityId, alias]
      );
    }
    await client.query(
      `
        UPDATE entity
        SET country = $2, updated_at = now()
        WHERE id = $1
      `,
      [targetEntityId, mergeFieldPolicy.country.manualValue]
    );

    await client.query(
      `
        INSERT INTO entity_redirect (old_entity_id, target_entity_id, redirect_type, source_type)
        VALUES ($1, $2, 'merge', 'candidate_entity')
        ON CONFLICT (old_entity_id) DO UPDATE SET target_entity_id = EXCLUDED.target_entity_id
      `,
      [candidate.entity_id, targetEntityId]
    );

    const auditId = `audit_candidate_entity_merge_${candidate.id}`;
    await client.query(
      `
        INSERT INTO audit_log (id, actor, action, target_type, target_id, before_payload, after_payload)
        VALUES ($1, 'verify-script', 'candidate_entity.merge', 'candidate_entity', $2, $3::jsonb, $4::jsonb)
        ON CONFLICT (id) DO UPDATE SET after_payload = EXCLUDED.after_payload
      `,
      [
        auditId,
        candidate.id,
        JSON.stringify(candidate),
        JSON.stringify({
          id: candidate.id,
          entityId: candidate.entity_id,
          mergeTargetEntityId: targetEntityId,
          mergeFieldPolicy,
          payload: mergedPayload
        })
      ]
    );

    const merged = await client.query("SELECT status, payload FROM candidate_entity WHERE id = $1", [candidate.id]);
    if (merged.rows[0]?.status !== "approved") {
      throw new Error(`candidate entity merge status not approved: ${candidate.id}`);
    }
    if (merged.rows[0]?.payload?.mergeTargetEntityId !== targetEntityId) {
      throw new Error(`candidate entity merge target missing from payload: ${candidate.id}`);
    }
    if (merged.rows[0]?.payload?.mergeFieldPolicy?.name?.choice !== "target") {
      throw new Error(`candidate entity merge field policy missing from payload: ${candidate.id}`);
    }
    const fieldPolicyCheck = await client.query("SELECT country FROM entity WHERE id = $1", [targetEntityId]);
    if (fieldPolicyCheck.rows[0]?.country !== mergeFieldPolicy.country.manualValue) {
      throw new Error(`candidate entity merge field policy did not update target entity country: ${targetEntityId}`);
    }

    const aliasCheck = await client.query(
      "SELECT COUNT(*)::int AS count FROM entity_alias WHERE entity_id = $1 AND alias = ANY($2::text[])",
      [targetEntityId, aliases]
    );
    if ((aliasCheck.rows[0]?.count || 0) < 1) {
      throw new Error(`candidate merge aliases were not present for ${targetEntityId}`);
    }

    const auditCheck = await client.query("SELECT id FROM audit_log WHERE id = $1 AND action = 'candidate_entity.merge'", [auditId]);
    if (!auditCheck.rows[0]) {
      throw new Error(`candidate entity merge audit log missing: ${auditId}`);
    }
    const mainRedirectCheck = await client.query("SELECT target_entity_id FROM entity_redirect WHERE old_entity_id = $1", [
      candidate.entity_id
    ]);
    if (mainRedirectCheck.rows[0]?.target_entity_id !== targetEntityId) {
      throw new Error(`main candidate redirect missing: ${candidate.entity_id} -> ${targetEntityId}`);
    }

    const duplicatePairResult = await client.query(
      `
        WITH duplicate_entities AS (
          SELECT lower(name) AS normalized_name, type
          FROM candidate_entity
          WHERE status = 'candidate'
          GROUP BY lower(name), type
          HAVING count(DISTINCT entity_id) > 1
        )
        SELECT source.*, target.id AS target_candidate_id, target.entity_id AS target_entity_id, target.name AS target_name,
               target.aliases AS target_aliases, target.payload AS target_payload
        FROM candidate_entity source
        JOIN duplicate_entities dup ON dup.normalized_name = lower(source.name) AND dup.type = source.type
        JOIN candidate_entity target ON lower(target.name) = lower(source.name)
          AND target.type = source.type
          AND target.id <> source.id
          AND target.entity_id <> source.entity_id
        WHERE source.status = 'candidate'
          AND target.status = 'candidate'
          AND EXISTS (
            SELECT 1
            FROM candidate_relationship cr
            WHERE cr.payload->>'sourceCandidateEntityId' = source.entity_id
               OR cr.payload->>'targetCandidateEntityId' = source.entity_id
          )
        ORDER BY
          CASE WHEN source.extraction_method = 'openalex_referenced_work_snapshot' THEN 0 ELSE 1 END,
          source.id,
          target.id
        LIMIT 1
        FOR UPDATE OF source, target
      `
    );
    const sourceCandidate = duplicatePairResult.rows[0];
    if (!sourceCandidate) {
      throw new Error("no duplicate candidate entity pair with relationship references found");
    }

    const targetCandidate = {
      id: sourceCandidate.target_candidate_id,
      entity_id: sourceCandidate.target_entity_id,
      name: sourceCandidate.target_name,
      aliases: sourceCandidate.target_aliases || [],
      payload: sourceCandidate.target_payload || {}
    };
    const candidateMergeReviewedAt = new Date().toISOString();
    const candidateMergeFieldPolicy = {
      aliases: {
        choice: "candidate",
        candidateValue: (sourceCandidate.aliases || []).join(", "),
        targetValue: targetCandidate.aliases.join(", ")
      }
    };
    const sourceMergePayload = {
      ...(sourceCandidate.payload || {}),
      mergeAction: "merged_into_candidate_entity",
      mergeTargetCandidateEntityId: targetCandidate.entity_id,
      mergedAt: candidateMergeReviewedAt,
      mergeFieldPolicy: candidateMergeFieldPolicy
    };
    const targetAliases = uniqueAliases(targetCandidate.name, targetCandidate.aliases || [], sourceCandidate.name, sourceCandidate.aliases || []);
    const targetPayload = {
      ...(targetCandidate.payload || {}),
      mergedCandidateEntityIds: [
        ...new Set([
          ...((Array.isArray(targetCandidate.payload?.mergedCandidateEntityIds)
            ? targetCandidate.payload.mergedCandidateEntityIds.filter((item) => typeof item === "string")
            : [])),
          sourceCandidate.entity_id
        ])
      ]
    };

    await client.query("UPDATE candidate_entity SET status = 'approved', reviewed_at = $2, payload = $3::jsonb WHERE id = $1", [
      sourceCandidate.id,
      candidateMergeReviewedAt,
      JSON.stringify(sourceMergePayload)
    ]);
    await client.query("UPDATE candidate_entity SET aliases = $2::jsonb, payload = $3::jsonb WHERE id = $1", [
      targetCandidate.id,
      JSON.stringify(targetAliases),
      JSON.stringify(targetPayload)
    ]);

    const relationshipResult = await client.query(
      `
        SELECT id, payload
        FROM candidate_relationship
        WHERE payload->>'sourceCandidateEntityId' = $1
           OR payload->>'targetCandidateEntityId' = $1
        FOR UPDATE
      `,
      [sourceCandidate.entity_id]
    );
    let rehangCount = 0;
    for (const row of relationshipResult.rows) {
      const payload = { ...(row.payload || {}) };
      if (payload.sourceCandidateEntityId === sourceCandidate.entity_id) {
        payload.sourceCandidateEntityId = targetCandidate.entity_id;
        payload.sourceCandidateName = targetCandidate.name;
      }
      if (payload.targetCandidateEntityId === sourceCandidate.entity_id) {
        payload.targetCandidateEntityId = targetCandidate.entity_id;
        payload.targetCandidateName = targetCandidate.name;
      }
      payload.redirectedCandidateEntityIds = [
        ...new Set([
          ...((Array.isArray(payload.redirectedCandidateEntityIds)
            ? payload.redirectedCandidateEntityIds.filter((item) => typeof item === "string")
            : [])),
          sourceCandidate.entity_id
        ])
      ];
      await client.query("UPDATE candidate_relationship SET payload = $2::jsonb WHERE id = $1", [row.id, JSON.stringify(payload)]);
      rehangCount += 1;
    }

    await client.query(
      `
        INSERT INTO entity_redirect (old_entity_id, target_entity_id, redirect_type, source_type)
        VALUES ($1, $2, 'merge', 'candidate_entity')
        ON CONFLICT (old_entity_id) DO UPDATE SET target_entity_id = EXCLUDED.target_entity_id
      `,
      [sourceCandidate.entity_id, targetCandidate.entity_id]
    );

    const candidateAuditId = `audit_candidate_entity_merge_candidate_${sourceCandidate.id}`;
    await client.query(
      `
        INSERT INTO audit_log (id, actor, action, target_type, target_id, before_payload, after_payload)
        VALUES ($1, 'verify-script', 'candidate_entity.merge_candidate', 'candidate_entity', $2, $3::jsonb, $4::jsonb)
        ON CONFLICT (id) DO UPDATE SET after_payload = EXCLUDED.after_payload
      `,
      [
        candidateAuditId,
        sourceCandidate.id,
        JSON.stringify(sourceCandidate),
        JSON.stringify({
          id: sourceCandidate.id,
          entityId: sourceCandidate.entity_id,
          mergeTargetCandidateEntityId: targetCandidate.entity_id,
          rehangCount,
          mergeFieldPolicy: candidateMergeFieldPolicy,
          payload: sourceMergePayload
        })
      ]
    );

    const redirectCheck = await client.query("SELECT target_entity_id FROM entity_redirect WHERE old_entity_id = $1", [
      sourceCandidate.entity_id
    ]);
    if (redirectCheck.rows[0]?.target_entity_id !== targetCandidate.entity_id) {
      throw new Error(`candidate redirect missing: ${sourceCandidate.entity_id} -> ${targetCandidate.entity_id}`);
    }
    const staleRelationshipCheck = await client.query(
      `
        SELECT count(*)::int AS count
        FROM candidate_relationship
        WHERE payload->>'sourceCandidateEntityId' = $1
           OR payload->>'targetCandidateEntityId' = $1
      `,
      [sourceCandidate.entity_id]
    );
    if (staleRelationshipCheck.rows[0].count !== 0) {
      throw new Error(`candidate relationship endpoints still reference merged entity: ${sourceCandidate.entity_id}`);
    }
    if (rehangCount < 1) {
      throw new Error(`candidate-to-candidate merge did not rehang relationships for ${sourceCandidate.entity_id}`);
    }
    const candidatePolicyCheck = await client.query("SELECT payload FROM candidate_entity WHERE id = $1", [sourceCandidate.id]);
    if (candidatePolicyCheck.rows[0]?.payload?.mergeFieldPolicy?.aliases?.choice !== "candidate") {
      throw new Error(`candidate-to-candidate merge field policy missing from payload: ${sourceCandidate.id}`);
    }

    const publicRedirectId = "legacy_redirect_test_amd";
    await client.query(
      `
        INSERT INTO entity_redirect (old_entity_id, target_entity_id, redirect_type, source_type)
        VALUES ($1, 'amd', 'merge', 'verify')
        ON CONFLICT (old_entity_id) DO UPDATE SET target_entity_id = EXCLUDED.target_entity_id
      `,
      [publicRedirectId]
    );
    const publicRedirectCheck = await client.query(
      `
        WITH redirected AS (
          SELECT COALESCE((SELECT target_entity_id FROM entity_redirect WHERE old_entity_id = $1), $1) AS id
        )
        SELECT e.id, e.name
        FROM entity e
        JOIN redirected r ON r.id = e.id
      `,
      [publicRedirectId]
    );
    if (publicRedirectCheck.rows[0]?.id !== "amd") {
      throw new Error(`public redirect query did not resolve ${publicRedirectId} to amd`);
    }

    await client.query("COMMIT");
    console.log("Candidate entity merge flow verified:");
    console.log(`- candidate_entity: ${candidate.id}`);
    console.log(`- merge_target_entity: ${targetEntityId}`);
    console.log(`- merged_aliases_seen: ${aliasCheck.rows[0].count}`);
    console.log("- merge_field_policy: verified");
    console.log("- merge_field_policy_target_update: verified");
    console.log("- candidate-to-candidate merge verified:");
    console.log(`  source_candidate_entity: ${sourceCandidate.entity_id}`);
    console.log(`  target_candidate_entity: ${targetCandidate.entity_id}`);
    console.log(`  rehang_count: ${rehangCount}`);
    console.log(`- public_redirect: ${publicRedirectId} -> amd`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : "candidate entity merge verification failed");
} finally {
  await pool.end();
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
