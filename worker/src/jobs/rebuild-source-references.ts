import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Logger } from 'pino';
import { createMysqlPool } from '../infrastructure/mysql/client';
import { createLogger } from '../support/logger';
import { SourceReferenceWriter } from './source-reference/writer';

/**
 * source_references 全量重建。
 *
 * 日常链路由 scheduled cleaner 在 clean batch 后自动抽取；这个 CLI 保留为历史回填、
 * extractor 规则变更后的强制重建和排障工具。写入逻辑与 worker 自动链路共用
 * SourceReferenceWriter，避免 CLI 与常驻 worker 语义分叉。
 */

export interface RebuildSourceReferencesStats {
  toolCalls: number;
  extracted: number;
  /** 新增行数 = 全表行数差（不依赖 affectedRows，规避 update/noop 差异）。 */
  inserted: number;
  /** 命中既有 reference_key 的次数（更新或无变化）。 */
  reused: number;
  parseFailed: number;
  unknown: number;
  /** sdd_skill_usages emit 的 skill source_reference 数。 */
  skillUsages: number;
  affectedRows: number;
}

const writer = new SourceReferenceWriter();

export async function rebuildSourceReferences(
  pool: Pool,
  logger: Logger,
): Promise<RebuildSourceReferencesStats> {
  const countBefore = await countRows(pool);
  const stats = await writer.rebuildAll(pool);
  const countAfter = await countRows(pool);
  const inserted = Math.max(0, countAfter - countBefore);
  const result: RebuildSourceReferencesStats = {
    ...stats,
    inserted,
    reused: Math.max(0, stats.extracted + stats.skillUsages - inserted),
  };

  logger.info({ stats: result }, 'source-references: rebuild completed');
  return result;
}

async function countRows(pool: Pool): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS n FROM source_references',
  );
  return Number(rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const pool = createMysqlPool();
  const logger = createLogger('rebuild-source-references');
  try {
    const stats = await rebuildSourceReferences(pool, logger);
    console.info(JSON.stringify(stats));
  } finally {
    await pool.end();
  }
}

void main();
