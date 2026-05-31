/**
 * 一次性回填：为存量 artifact 写入补出「生成对话」讨论 turn。
 * 窗口：同 session、[控制它的 skill 运行激活 turn started_at, 写入 event_time)，排除写入节点 turn。
 * 幂等：turn_key = sha256('turn:' + artifact_id + ':' + interaction_id)，与 worker 口径一致。
 */
import { createAppDataSource } from './data-source';

async function main(): Promise<void> {
  const ds = await createAppDataSource();
  await ds.initialize();
  try {
    const result = await ds.query(`
      INSERT IGNORE INTO sdd_work_item_artifact_turns
        (turn_key, artifact_id, work_item_id, interaction_id, skill_usage_id, user_id,
         session_id, anchor_event_time, write_event_time, event_time, rule_version,
         gmt_create, gmt_modified)
      SELECT
        SHA2(CONCAT('turn:', w.artifact_id, ':', i.id), 256),
        w.artifact_id, w.work_item_id, i.id, w.skill_usage_id, i.user_id,
        w.session_id, COALESCE(anchor.started_at, su.event_time), w.event_time, i.started_at,
        'doc-conversation-v1', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
      FROM sdd_work_item_artifact_writes w
      JOIN sdd_skill_usages su ON su.id = w.skill_usage_id
      LEFT JOIN sdd_interactions anchor ON anchor.id = su.interaction_id
      JOIN sdd_interactions i
        ON i.session_id = w.session_id
       AND i.started_at IS NOT NULL
       AND i.started_at < w.event_time
       AND i.started_at >= COALESCE(anchor.started_at, su.event_time)
      WHERE w.skill_usage_id IS NOT NULL
        AND w.session_id IS NOT NULL
        AND w.event_time IS NOT NULL
        AND i.id NOT IN (
          SELECT awr.interaction_id FROM sdd_work_item_artifact_writes awr
          WHERE awr.session_id = w.session_id AND awr.interaction_id IS NOT NULL
        )
    `);
    console.info('[backfill-artifact-turns] done', result);
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  void main();
}
