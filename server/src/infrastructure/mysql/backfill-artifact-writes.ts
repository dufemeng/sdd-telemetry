/**
 * 一次性回填：把 otel_log_events 里的 artifact 写入事件灌入 sdd_work_item_artifact_writes。
 * 口径：写入事件的 sdd.artifact_path（或 sdd.artifact.path）落在某 artifact.artifact_full_path 上即关联。
 * 幂等：write_key = sha256(event_id + ':' + artifact_key)，重复跑不产生重复。
 */
import { createHash } from 'node:crypto';
import { createAppDataSource } from './data-source';

interface LogEvent {
  event_id: string;
  user_id: string | null;
  session_id: string | null;
  prompt_id: string | null;
  event_sequence: number | null;
  event_time: Date | null;
  artifact_path: string | null;
  tool_name: string | null;
}

interface ArtifactRecord {
  id: string;
  artifact_key: string;
  work_item_id: string;
}

interface InteractionRecord {
  id: string;
}

interface SkillUsageRecord {
  id: string;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function parseJsonObject(json: unknown): Record<string, unknown> {
  if (typeof json === 'object' && json !== null) {
    return json as Record<string, unknown>;
  }
  if (typeof json === 'string') {
    try {
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  return null;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return false;
}

async function main(): Promise<void> {
  const ds = await createAppDataSource();
  await ds.initialize();

  try {
    console.log('[backfill] fetching events with artifact write signals...');

    // Step 1: 查询所有带 artifact write 信号的事件
    const events = (await ds.query(
      `SELECT e.event_id, e.user_id, e.session_id, e.prompt_id, e.event_sequence, e.event_time,
              e.attributes_json
       FROM otel_log_events e
       WHERE JSON_EXTRACT(e.attributes_json, '$."sdd.artifact_is_write"') = true
          OR JSON_EXTRACT(e.attributes_json, '$."sdd.artifact.is_write"') = true
       LIMIT 100000`,
    )) as Array<{
      event_id: string;
      user_id: string | null;
      session_id: string | null;
      prompt_id: string | null;
      event_sequence: number | null;
      event_time: Date | null;
      attributes_json: unknown;
    }>;

    console.log(`[backfill] found ${events.length} events with artifact write signals`);

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      if ((i + 1) % 100 === 0) {
        console.log(
          `[backfill] processed ${i + 1}/${events.length}, inserted=${inserted} skipped=${skipped} errors=${errors}`,
        );
      }

      try {
        // 提取 artifact path
        const attributes = parseJsonObject(e.attributes_json);
        const artifactPath =
          readString(attributes['sdd.artifact_path']) ||
          readString(attributes['sdd.artifact.path']) ||
          readString(attributes['artifact.path']);

        if (!artifactPath) {
          skipped++;
          continue;
        }

        // 提取 tool_name
        const toolName =
          readString(attributes['tool_name']) ||
          readString(attributes['tool.name']) ||
          readString(attributes['sdd.tool_name']);

        const writeKind = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName || '')
          ? (toolName as string)
          : 'other';

        // 查找关联的 artifact
        const artifacts = (await ds.query(
          `SELECT id, artifact_key, work_item_id FROM sdd_work_item_artifacts
           WHERE artifact_full_path = ? LIMIT 1`,
          [artifactPath],
        )) as ArtifactRecord[];

        if (artifacts.length === 0) {
          skipped++;
          continue;
        }

        const artifact = artifacts[0]!;

        // 查找关联的 interaction（可选）
        let interactionId: string | null = null;
        if (e.prompt_id) {
          const interactions = (await ds.query(
            `SELECT id FROM sdd_interactions WHERE prompt_id = ? ORDER BY id ASC LIMIT 1`,
            [e.prompt_id],
          )) as InteractionRecord[];
          if (interactions.length > 0) {
            interactionId = interactions[0]!.id;
          }
        }

        // 查找关联的 skill_usage（可选）
        let skillUsageId: string | null = null;
        if (e.session_id) {
          const skillUsages = (await ds.query(
            `SELECT id FROM sdd_skill_usages
             WHERE session_id = ? AND work_item_id = ?
             ORDER BY event_time DESC, id DESC LIMIT 1`,
            [e.session_id, artifact.work_item_id],
          )) as SkillUsageRecord[];
          if (skillUsages.length > 0) {
            skillUsageId = skillUsages[0]!.id;
          }
        }

        // 构造 write_key
        const writeKey = sha256(`${e.event_id}:${artifact.artifact_key}`);

        // 插入或更新 artifact write 记录
        await ds.query(
          `INSERT INTO sdd_work_item_artifact_writes
            (write_key, artifact_id, work_item_id, interaction_id, skill_usage_id, user_id,
             session_id, prompt_id, event_id, write_kind, content_preview, event_sequence,
             event_time, rule_version, gmt_create, gmt_modified)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'backfill-v1',
                   CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
           ON DUPLICATE KEY UPDATE gmt_modified = CURRENT_TIMESTAMP(3)`,
          [
            writeKey,
            artifact.id,
            artifact.work_item_id,
            interactionId,
            skillUsageId,
            e.user_id,
            e.session_id,
            e.prompt_id,
            e.event_id,
            writeKind,
            e.event_sequence,
            e.event_time,
          ],
        );

        inserted++;
      } catch (err) {
        console.error(
          `[backfill] error processing event ${e.event_id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        errors++;
      }
    }

    console.log(
      `[backfill] done: processed=${events.length} inserted=${inserted} skipped=${skipped} errors=${errors}`,
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
