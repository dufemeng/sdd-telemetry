import path from 'node:path';

export interface ParsedWikiPath {
  relative: string | null;
  domain: string | null;
  axis: string | null;
  system: string | null;
}

export function parseWikiPath(wikiRootPath: string, rawPath: string): ParsedWikiPath {
  const normalizedRoot = wikiRootPath.replace(/\/+$/, '');
  const normalizedPath = path.posix.normalize(rawPath);

  if (
    !normalizedPath.startsWith(normalizedRoot + '/') &&
    normalizedPath !== normalizedRoot
  ) {
    return { relative: null, domain: null, axis: null, system: null };
  }

  const relative = normalizedPath
    .slice(normalizedRoot.length)
    .replace(/^\/+/, '');
  if (relative === '') {
    return { relative: '', domain: null, axis: 'root', system: null };
  }

  const segments = relative.split('/');

  // L1: domain
  if (!segments[0]?.startsWith('domain-')) {
    return { relative, domain: null, axis: 'root', system: null };
  }
  const domain = segments[0].slice('domain-'.length);

  // L2: axis
  const axis = segments[1] ?? null;

  // L3: system（仅 axis=system 且第三段为 apps）
  let system: string | null = null;
  if (axis === 'system' && segments[2] === 'apps') {
    system = segments[3] ?? null;
  }

  return { relative, domain, axis, system };
}

export interface CandidatePath {
  actionType: 'read' | 'glob' | 'grep';
  candidate: string;
}

interface ToolInput {
  file_path?: string;
  path?: string;
  pattern?: string;
  glob?: string;
}

export function extractCandidatePath(
  toolName: string,
  input: ToolInput,
): CandidatePath | null {
  switch (toolName) {
    case 'Read': {
      const fp = input.file_path;
      if (!fp || !fp.startsWith('/')) return null;  // 必须绝对路径
      return { actionType: 'read', candidate: fp };
    }
    case 'Glob': {
      const c = input.path ?? input.pattern;
      if (!c) return null;
      return { actionType: 'glob', candidate: c };
    }
    case 'Grep': {
      const c = input.path ?? input.glob;
      if (!c) return null;
      return { actionType: 'grep', candidate: c };
    }
    default:
      return null;
  }
}
