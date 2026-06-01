import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanKnowledgeBase } from '../src/modules/sdd/wiki-scan';

let root: string;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'kb-'));
  const f = path.join(root, 'bk-fe-knowledge-trade', 'domain-cashier', 'business');
  mkdirSync(f, { recursive: true });
  writeFileSync(path.join(f, 'INDEX.md'), '# index');
  writeFileSync(path.join(f, 'note.txt'), 'ignored');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('scanKnowledgeBase', () => {
  it('递归收集 .md，归一化 repo/domain，带 mtime', async () => {
    const result = await scanKnowledgeBase(root);
    expect(result.configured).toBe(true);
    expect(result.docs).toHaveLength(1);
    const doc = result.docs[0]!;
    expect(doc.repo).toBe('trade');
    expect(doc.domain).toBe('cashier');
    expect(doc.relativePath).toBe('domain-cashier/business/INDEX.md');
    expect(doc.mtimeMs).toBeGreaterThan(0);
  });

  it('根不存在 → configured:false，docs 空', async () => {
    const result = await scanKnowledgeBase(path.join(root, 'nope'));
    expect(result.configured).toBe(false);
    expect(result.docs).toEqual([]);
  });

  it('根为空字符串（未配置）→ configured:false', async () => {
    const result = await scanKnowledgeBase('');
    expect(result.configured).toBe(false);
  });
});
