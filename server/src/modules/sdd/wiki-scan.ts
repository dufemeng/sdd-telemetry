import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScannedDoc } from './wiki-coverage';

export interface ScanRepoMeta {
  repo: string;
  label: string;
  gitRef: string | null;
  scannedAt: string;
}

export interface ScanResult {
  configured: boolean;
  docs: ScannedDoc[];
  repos: ScanRepoMeta[];
}

const REPO_LABEL: Record<string, string> = { trade: '交易', loan: '融资', wealth: '理财' };

function parseRelative(relative: string): { domain: string | null; axis: string | null; system: string | null } {
  const seg = relative.split('/');
  if (!seg[0]?.startsWith('domain-')) return { domain: null, axis: 'root', system: null };
  const domain = seg[0]!.slice('domain-'.length);
  const axis = seg[1] ?? null;
  let system: string | null = null;
  if (axis === 'system' && seg[2] === 'apps') system = seg[3] ?? null;
  return { domain, axis, system };
}

async function walkMd(dir: string, repoRoot: string, out: { rel: string; mtimeMs: number }[]) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walkMd(abs, repoRoot, out);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      const s = await stat(abs).catch(() => null);
      if (s) {
        out.push({
          rel: path.relative(repoRoot, abs).split(path.sep).join('/'),
          mtimeMs: s.mtimeMs,
        });
      }
    }
  }
}

async function readGitRef(repoRoot: string): Promise<string | null> {
  const head = await readFile(path.join(repoRoot, '.git', 'HEAD'), 'utf8').catch(() => null);
  if (!head) return null;
  const m = head.trim().match(/^ref:\s*(.+)$/);
  if (!m) return head.trim().slice(0, 12);
  const sha = await readFile(path.join(repoRoot, '.git', m[1]!), 'utf8').catch(() => null);
  return sha ? sha.trim().slice(0, 12) : null;
}

export async function scanKnowledgeBase(rootPath: string): Promise<ScanResult> {
  if (!rootPath) return { configured: false, docs: [], repos: [] };
  let dirs;
  try {
    dirs = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return { configured: false, docs: [], repos: [] };
  }

  const docs: ScannedDoc[] = [];
  const repos: ScanRepoMeta[] = [];
  const scannedAt = new Date().toISOString();

  for (const d of dirs) {
    if (!d.isDirectory() || !d.name.startsWith('bk-fe-knowledge-')) continue;
    const repo = d.name.replace(/^bk-fe-knowledge-/, '');
    const repoRoot = path.join(rootPath, d.name);
    const files: { rel: string; mtimeMs: number }[] = [];
    await walkMd(repoRoot, repoRoot, files);
    for (const f of files) {
      const { domain, axis, system } = parseRelative(f.rel);
      docs.push({ repo, domain, relativePath: f.rel, axis, system, mtimeMs: f.mtimeMs });
    }
    repos.push({ repo, label: REPO_LABEL[repo] ?? repo, gitRef: await readGitRef(repoRoot), scannedAt });
  }

  return { configured: true, docs, repos };
}
