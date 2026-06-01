import path from 'node:path';

/**
 * 从采集机绝对路径推断知识库仓库目录名。
 * 主路径：rawPath 以 '/'+relativePath 结尾 → 截掉得仓库根 → 取最后一段。
 * 兜底：在路径段里找第一个 bk-fe-knowledge* 段。
 */
export function deriveRepoName(rawPath: string, relativePath: string | null): string | null {
  if (relativePath && rawPath.endsWith(relativePath)) {
    const root = rawPath.slice(0, rawPath.length - relativePath.length).replace(/\/+$/, '');
    const base = root.split('/').pop();
    if (base) return base;
  }
  const seg = rawPath.split('/').find((s) => s.startsWith('bk-fe-knowledge'));
  return seg ?? null;
}

/**
 * 把仓库内相对路径拼到服务器知识库根，带越权守卫。
 * 解析后仍须落在 {root}/{repoName} 内，否则返回 null。
 */
export function resolveWikiContentPath(
  root: string,
  repoName: string,
  relativePath: string,
): string | null {
  const repoDir = path.resolve(root, repoName);
  const target = path.resolve(repoDir, relativePath);
  if (target !== repoDir && !target.startsWith(repoDir + path.sep)) return null;
  return target;
}
