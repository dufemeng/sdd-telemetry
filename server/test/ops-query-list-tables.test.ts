import { describe, expect, it, vi } from 'vitest';
import { OpsQueryService } from '../src/modules/ops/ops-query.service';

describe('OpsQueryService.listTables', () => {
  it('用 information_schema 的 estimated_rows 填行数，不对每张表做 COUNT(*)', async () => {
    const countRows = vi.fn().mockResolvedValue(0); // 不应被调用：列表页不做全表扫
    const repo = {
      listAllTablesMeta: vi.fn().mockResolvedValue([
        { table_name: 't1', estimated_rows: 123, data_bytes: 10, index_bytes: 5, updated_at: null },
        { table_name: 't2', estimated_rows: 456, data_bytes: 20, index_bytes: 7, updated_at: null },
      ]),
      listColumnsForTables: vi.fn().mockResolvedValue([]),
      countRows,
    };
    const service = new OpsQueryService();
    service.opsQueryRepository = repo as never;

    const result = await service.listTables();

    // 核心：不再对每张表发 COUNT(*)（这正是 /ops/database 慢的根因）
    expect(countRows).not.toHaveBeenCalled();
    // estimatedRows 直接取 information_schema 的近似值
    const byName = new Map(result.tables.map((t) => [t.tableName, t.estimatedRows]));
    expect(byName.get('t1')).toBe(123);
    expect(byName.get('t2')).toBe(456);
  });
});
