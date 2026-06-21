import path from 'node:path';

export function relativeWikiPath(wikiRootPath: string, rawPath: string): string | null {
  const normalizedRoot = wikiRootPath.replace(/\/+$/, '');
  const normalizedPath = path.posix.normalize(rawPath);

  if (!normalizedPath.startsWith(normalizedRoot + '/') && normalizedPath !== normalizedRoot) {
    return null;
  }

  const relative = normalizedPath.slice(normalizedRoot.length).replace(/^\/+/, '');
  return relative;
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

export function extractCandidatePath(toolName: string, input: ToolInput): CandidatePath | null {
  switch (toolName) {
    case 'Read': {
      const fp = input.file_path;
      if (!fp || !fp.startsWith('/')) return null; // 必须绝对路径
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
