/**
 * 一次性回填：为存量 artifact 写入补出「生成对话」讨论 turn。
 * 窗口：同 session、[上一次 artifact 写入时间或 session 起点, 本次写入 event_time)，排除写入节点 turn。
 * 幂等：turn_key = sha256('turn:' + artifact_id + ':' + interaction_id)，与 worker 口径一致。
 * 重跑会先清掉旧 v1 行，再刷新 v2 行的窗口元数据与 rule_version。
 */
import { createAppDataSource } from "./data-source";

async function main(): Promise<void> {
  const ds = await createAppDataSource();
  await ds.initialize();
  try {
    const result = await ds.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM sdd_work_item_artifact_turns WHERE rule_version = 'doc-conversation-v1'`,
      );

      return manager.query(`
        INSERT INTO sdd_work_item_artifact_turns
          (turn_key, artifact_id, work_item_id, interaction_id, skill_usage_id, user_id,
           session_id, anchor_event_time, write_event_time, event_time, rule_version,
           gmt_create, gmt_modified)
        SELECT
          SHA2(CONCAT('turn:', w.artifact_id, ':', i.id), 256),
          w.artifact_id, w.work_item_id, i.id, w.skill_usage_id, i.user_id,
          w.session_id,
          COALESCE(
            (SELECT MAX(prev_w.event_time) FROM sdd_work_item_artifact_writes prev_w
             WHERE prev_w.session_id = w.session_id
               AND prev_w.event_time IS NOT NULL
               AND prev_w.event_time < w.event_time),
            (SELECT MIN(first_i.started_at) FROM sdd_interactions first_i
             WHERE first_i.session_id = w.session_id AND first_i.started_at IS NOT NULL)
          ),
          w.event_time, i.started_at,
          'doc-conversation-v2', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        FROM sdd_work_item_artifact_writes w
        JOIN sdd_interactions i
          ON i.session_id = w.session_id
         AND i.started_at IS NOT NULL
         AND i.started_at < w.event_time
         AND i.started_at >= COALESCE(
            (SELECT MAX(prev_w.event_time) FROM sdd_work_item_artifact_writes prev_w
             WHERE prev_w.session_id = w.session_id
               AND prev_w.event_time IS NOT NULL
               AND prev_w.event_time < w.event_time),
            (SELECT MIN(first_i.started_at) FROM sdd_interactions first_i
             WHERE first_i.session_id = w.session_id AND first_i.started_at IS NOT NULL)
          )
        WHERE w.session_id IS NOT NULL
          AND w.event_time IS NOT NULL
          AND i.id NOT IN (
            SELECT awr.interaction_id FROM sdd_work_item_artifact_writes awr
            WHERE awr.session_id = w.session_id AND awr.interaction_id IS NOT NULL
          )
        ON DUPLICATE KEY UPDATE
          skill_usage_id = COALESCE(VALUES(skill_usage_id), skill_usage_id),
          user_id = COALESCE(VALUES(user_id), user_id),
          session_id = COALESCE(VALUES(session_id), session_id),
          anchor_event_time = VALUES(anchor_event_time),
          write_event_time = VALUES(write_event_time),
          event_time = VALUES(event_time),
          rule_version = VALUES(rule_version),
          gmt_modified = CURRENT_TIMESTAMP(3)
      `);
    });
    console.info("[backfill-artifact-turns] done", result);
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  void main();
}
