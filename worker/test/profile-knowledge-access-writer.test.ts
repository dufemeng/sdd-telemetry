import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { insertProfileKnowledgeAccess } from '../src/jobs/profile-projection/knowledge-access-writer';

describe('profile knowledge access writer', () => {
  it('writes only locator facts and keeps SQL placeholders aligned', async () => {
    let capturedSql = '';
    let capturedParams: unknown[] = [];
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        capturedSql = sql;
        capturedParams = params;
        return [{ affectedRows: 1 }, undefined];
      },
    } as unknown as Pool;

    await insertProfileKnowledgeAccess(pool, {
      profileId: 'sdd-default',
      projectionRunId: 1,
      recallKey: 'recall-key',
      sourceReferenceKey: 'source-key',
      sourceReferenceId: 2,
      toolCallId: 3,
      interactionId: 4,
      capabilityUsageId: 5,
      deliveryUnitId: 6,
      userId: 7,
      sessionId: 'session',
      promptId: 'prompt',
      actionType: 'read',
      knowledgeLocator: 'trade/domain-cashier/innerFlow/a.md',
      sourceNamespace: 'trade',
      relativePath: 'domain-cashier/innerFlow/a.md',
      eventTime: new Date('2026-06-18T10:00:00.000Z'),
      matchedRuleId: 'knowledge-root',
      confidence: 'high',
      evidenceJson: '{}',
      ruleVersion: 'knowledge-v1',
    });

    expect(capturedSql).not.toMatch(/knowledge_(domain|axis|system)/);
    expect(capturedSql.match(/\?/g)).toHaveLength(21);
    expect(capturedParams).toHaveLength(21);
  });
});
