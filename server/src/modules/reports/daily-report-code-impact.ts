import path from 'node:path';
import type { DailyReportCodeImpact } from '@sdd-telemetry/api';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const EXCLUDED_REPO_PARTS = [
  '/bk-fe-requirements-',
  '/bk-fe-knowledge-',
  '/bksdd-wiki',
];

export interface CodeImpactToolRow {
  toolName: string;
  toolInputPreview: string | null;
  userId: string | number | null;
  requirementsRootPath: string | null;
  wikiRootPath: string | null;
}

interface ToolPath {
  value: string;
  fileLike: boolean;
}

export function summarizeCodeImpactRows(rows: CodeImpactToolRow[]): DailyReportCodeImpact {
  let codeWriteCount = 0;
  let codeReadCount = 0;
  const touchedFiles = new Set<string>();
  const contributors = new Set<string>();
  const repoStats = new Map<string, { repository: string; writeCount: number; readCount: number }>();

  for (const row of rows) {
    if (!WRITE_TOOLS.has(row.toolName) && !READ_TOOLS.has(row.toolName)) {
      continue;
    }

    const toolPath = extractToolPath(row.toolInputPreview);
    if (!toolPath || !isBusinessCodePath(toolPath.value, row)) {
      continue;
    }

    if (row.userId !== null && row.userId !== undefined) {
      contributors.add(String(row.userId));
    }

    if (toolPath.fileLike) {
      touchedFiles.add(normalizePath(toolPath.value));
    }

    const repository = inferRepositoryName(toolPath.value);
    const stat = repoStats.get(repository) ?? { repository, writeCount: 0, readCount: 0 };
    if (WRITE_TOOLS.has(row.toolName)) {
      codeWriteCount += 1;
      stat.writeCount += 1;
    } else {
      codeReadCount += 1;
      stat.readCount += 1;
    }
    repoStats.set(repository, stat);
  }

  const topRepositories = Array.from(repoStats.values())
    .sort((a, b) => b.writeCount - a.writeCount || b.readCount - a.readCount || a.repository.localeCompare(b.repository))
    .slice(0, 5);

  return {
    codeWriteCount,
    codeReadCount,
    touchedFileCount: touchedFiles.size,
    contributorCount: contributors.size,
    topRepositories,
    summary: buildCodeImpactSummary(codeWriteCount, codeReadCount, touchedFiles.size, contributors.size),
  };
}

export interface UserCodeImpactCount {
  codeWriteCount: number;
  codeReadCount: number;
}

export function summarizeCodeImpactByUser(
  rows: CodeImpactToolRow[],
): Map<string, UserCodeImpactCount> {
  const byUser = new Map<string, UserCodeImpactCount>();
  for (const row of rows) {
    if (!WRITE_TOOLS.has(row.toolName) && !READ_TOOLS.has(row.toolName)) {
      continue;
    }
    if (row.userId === null || row.userId === undefined) {
      continue;
    }
    const toolPath = extractToolPath(row.toolInputPreview);
    if (!toolPath || !isBusinessCodePath(toolPath.value, row)) {
      continue;
    }
    const key = String(row.userId);
    const stat = byUser.get(key) ?? { codeWriteCount: 0, codeReadCount: 0 };
    if (WRITE_TOOLS.has(row.toolName)) {
      stat.codeWriteCount += 1;
    } else {
      stat.codeReadCount += 1;
    }
    byUser.set(key, stat);
  }
  return byUser;
}

function extractToolPath(inputPreview: string | null): ToolPath | null {
  if (!inputPreview) return null;
  let input: unknown;
  try {
    input = JSON.parse(inputPreview);
  } catch {
    const fallbackPath = extractPathFromTruncatedPreview(inputPreview, 'file_path')
      ?? extractPathFromTruncatedPreview(inputPreview, 'filePath');
    if (fallbackPath) {
      return { value: fallbackPath, fileLike: true };
    }
    const fallbackDirectory = extractPathFromTruncatedPreview(inputPreview, 'path');
    return fallbackDirectory
      ? { value: fallbackDirectory, fileLike: looksLikeFilePath(fallbackDirectory) }
      : null;
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const filePath = readString(record.file_path) ?? readString(record.filePath);
  if (filePath) {
    return { value: filePath, fileLike: true };
  }

  const pathValue = readString(record.path);
  if (!pathValue) {
    return null;
  }
  return { value: pathValue, fileLike: looksLikeFilePath(pathValue) };
}

function isBusinessCodePath(filePath: string, row: CodeImpactToolRow): boolean {
  const normalized = normalizePath(filePath);
  if (!normalized.startsWith('/')) {
    return false;
  }

  if (
    isInsideRoot(normalized, row.requirementsRootPath) ||
    isInsideRoot(normalized, row.wikiRootPath)
  ) {
    return false;
  }

  const lower = normalized.toLowerCase();
  if (EXCLUDED_REPO_PARTS.some((part) => lower.includes(part))) {
    return false;
  }

  return true;
}

function inferRepositoryName(filePath: string): string {
  const normalized = normalizePath(filePath);
  const segments = normalized.split('/').filter(Boolean);
  const markers = ['src', 'app', 'apps', 'packages', 'web', 'server'];
  for (const marker of markers) {
    const index = segments.indexOf(marker);
    if (index > 0) {
      return segments[index - 1]!;
    }
  }

  const parsed = path.posix.parse(normalized);
  const dirSegments = parsed.dir.split('/').filter(Boolean);
  return dirSegments.at(-1) ?? parsed.name ?? 'unknown';
}

function buildCodeImpactSummary(
  writeCount: number,
  readCount: number,
  fileCount: number,
  contributorCount: number,
): string {
  if (writeCount > 0) {
    return `昨日 SDD 参与代码改动 ${writeCount} 次，配套读取 ${readCount} 次，涉及 ${fileCount} 个代码文件、${contributorCount} 位用户。`;
  }
  if (readCount > 0) {
    return `昨日 SDD 参与代码读取 ${readCount} 次，涉及 ${fileCount} 个代码文件、${contributorCount} 位用户。`;
  }
  return '昨日未观测到 SDD 参与业务代码读写。';
}

function isInsideRoot(filePath: string, rootPath: string | null): boolean {
  if (!rootPath) return false;
  const root = normalizePath(rootPath).replace(/\/+$/, '');
  return filePath === root || filePath.startsWith(`${root}/`);
}

function normalizePath(value: string): string {
  return path.posix.normalize(value.replace(/\\/g, '/'));
}

function looksLikeFilePath(value: string): boolean {
  return path.posix.extname(value) !== '';
}

function extractPathFromTruncatedPreview(value: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`"${escapedKey}"\\s*:\\s*"([^"]+)`);
  const match = pattern.exec(value);
  return match?.[1] ? unescapeJsonString(match[1]) : null;
}

function unescapeJsonString(value: string): string {
  return value.replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
