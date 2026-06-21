import type { Pool, ResultSetHeader } from 'mysql2/promise';

export interface ProfileKnowledgeAccessWrite {
  profileId: string;
  projectionRunId: number;
  recallKey: string;
  sourceReferenceKey: string;
  sourceReferenceId: number;
  toolCallId: number | null;
  interactionId: number | null;
  capabilityUsageId: number | null;
  deliveryUnitId: number | null;
  userId: number | null;
  sessionId: string | null;
  promptId: string | null;
  actionType: string;
  knowledgeLocator: string;
  sourceNamespace: string;
  relativePath: string;
  eventTime: Date | null;
  matchedRuleId: string;
  confidence: string;
  evidenceJson: string;
  ruleVersion: string;
}

export async function insertProfileKnowledgeAccess(
  pool: Pool,
  input: ProfileKnowledgeAccessWrite,
): Promise<void> {
  await pool.query<ResultSetHeader>(
    `INSERT INTO profile_knowledge_recalls
       (profile_id, projection_run_id, recall_key, source_reference_key, source_reference_id,
        tool_call_id, interaction_id, capability_usage_id, delivery_unit_id, user_id, session_id, prompt_id,
        action_type, knowledge_locator, source_namespace, relative_path, event_time,
        matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.profileId,
      input.projectionRunId,
      input.recallKey,
      input.sourceReferenceKey,
      input.sourceReferenceId,
      input.toolCallId,
      input.interactionId,
      input.capabilityUsageId,
      input.deliveryUnitId,
      input.userId,
      input.sessionId,
      input.promptId,
      input.actionType,
      input.knowledgeLocator,
      input.sourceNamespace,
      input.relativePath,
      input.eventTime,
      input.matchedRuleId,
      input.confidence,
      input.evidenceJson,
      input.ruleVersion,
    ],
  );
}
