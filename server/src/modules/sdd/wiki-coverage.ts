export type DocStatus = 'hot' | 'cold' | 'dead' | 'new';

export interface ScannedDoc {
  repo: string;
  domain: string | null;
  relativePath: string;
  axis: string | null;
  system: string | null;
  mtimeMs: number;
}

export interface RecallAgg {
  repo: string;
  relativePath: string;
  recallCount: number;
  distinctUsers: number;
  lastRecallAt: string | null;
  lastToolCallId: string | null;
}

export interface CoverageRepo {
  repo: string;
  label: string;
  totalDocs: number;
  recalledDocs: number;
  coverageRate: number;
  recalls: number;
  deadDocs: number;
  newUnreadDocs: number;
  distinctUsers: number;
}

export interface CoverageDomain {
  repo: string;
  domain: string;
  totalDocs: number;
  recalledDocs: number;
  recalls: number;
  deadDocs: number;
  newUnreadDocs: number;
  distinctUsers: number;
  lastRecallAt: string | null;
}

export interface CoverageResult {
  totals: {
    totalDocs: number;
    recalledDocs: number;
    coverageRate: number;
    recalls: number;
    coldDocs: number;
    deadDocs: number;
    newUnreadDocs: number;
    orphanPaths: number;
  };
  repos: CoverageRepo[];
  domains: CoverageDomain[];
}

export const HOT_THRESHOLD = 10;

/** domain 为空（库根、非 domain-* 目录下的文档）时的展示名。前后端及 service 过滤须一致。 */
export const ROOT_DOMAIN_LABEL = '（根目录）';

const REPO_LABEL: Record<string, string> = { trade: '交易', loan: '融资', wealth: '理财' };

export function repoLabel(repo: string): string {
  return REPO_LABEL[repo] ?? repo;
}

export function classifyDoc(recallCount: number, mtimeMs: number, nowMs: number, graceDays: number): DocStatus {
  if (recallCount >= HOT_THRESHOLD) return 'hot';
  if (recallCount >= 1) return 'cold';
  return nowMs - mtimeMs <= graceDays * 86_400_000 ? 'new' : 'dead';
}

export interface DomainDistinctUsers {
  domain: string | null;
  repo: string;
  distinctUsers: number;
}

export interface RepoDistinctUsers {
  repo: string;
  distinctUsers: number;
}

const key = (repo: string, rel: string) => `${repo}\0${rel}`;

export function buildCoverage(
  scanned: ScannedDoc[],
  recalls: RecallAgg[],
  domainUsersLookup: DomainDistinctUsers[],
  repoUsersLookup: RepoDistinctUsers[],
  nowMs: number,
  graceDays: number,
): CoverageResult {
  const recallByKey = new Map<string, RecallAgg>();
  for (const r of recalls) recallByKey.set(key(r.repo, r.relativePath), r);

  const domainUsers = new Map<string, number>();
  for (const d of domainUsersLookup) {
    domainUsers.set(key(d.repo, d.domain ?? ROOT_DOMAIN_LABEL), d.distinctUsers);
  }

  const repoUsers = new Map<string, number>();
  for (const r of repoUsersLookup) {
    repoUsers.set(r.repo, r.distinctUsers);
  }

  const repoAgg = new Map<string, CoverageRepo>();
  const domainAgg = new Map<string, CoverageDomain>();
  const totals = { totalDocs: 0, recalledDocs: 0, coverageRate: 0, recalls: 0, coldDocs: 0, deadDocs: 0, newUnreadDocs: 0, orphanPaths: 0 };

  const repoOf = (repo: string): CoverageRepo => {
    let v = repoAgg.get(repo);
    if (!v) {
      v = { repo, label: repoLabel(repo), totalDocs: 0, recalledDocs: 0, coverageRate: 0, recalls: 0, deadDocs: 0, newUnreadDocs: 0, distinctUsers: 0 };
      repoAgg.set(repo, v);
    }
    return v;
  };
  const domainOf = (repo: string, domain: string): CoverageDomain => {
    const k = key(repo, domain);
    let v = domainAgg.get(k);
    if (!v) {
      v = { repo, domain, totalDocs: 0, recalledDocs: 0, recalls: 0, deadDocs: 0, newUnreadDocs: 0, distinctUsers: 0, lastRecallAt: null };
      domainAgg.set(k, v);
    }
    return v;
  };

  for (const doc of scanned) {
    const r = recallByKey.get(key(doc.repo, doc.relativePath));
    const count = r?.recallCount ?? 0;
    const status = classifyDoc(count, doc.mtimeMs, nowMs, graceDays);
    const repo = repoOf(doc.repo);
    const domain = domainOf(doc.repo, doc.domain ?? ROOT_DOMAIN_LABEL);

    totals.totalDocs++;
    repo.totalDocs++;
    domain.totalDocs++;
    if (count >= 1) {
      totals.recalledDocs++;
      repo.recalledDocs++;
      domain.recalledDocs++;
      totals.recalls += count;
      repo.recalls += count;
      domain.recalls += count;
      if (status === 'cold') totals.coldDocs++;
      if (r!.lastRecallAt && (!domain.lastRecallAt || r!.lastRecallAt > domain.lastRecallAt)) {
        domain.lastRecallAt = r!.lastRecallAt;
      }
    }
    if (status === 'dead') {
      totals.deadDocs++;
      repo.deadDocs++;
      domain.deadDocs++;
    }
    if (status === 'new') {
      totals.newUnreadDocs++;
      repo.newUnreadDocs++;
      domain.newUnreadDocs++;
    }
  }

  for (const domain of domainAgg.values()) {
    domain.distinctUsers = domainUsers.get(key(domain.repo, domain.domain)) ?? 0;
  }
  for (const repo of repoAgg.values()) {
    repo.distinctUsers = repoUsers.get(repo.repo) ?? 0;
  }

  const scannedKeys = new Set(scanned.map((d) => key(d.repo, d.relativePath)));
  for (const r of recalls) {
    if (!scannedKeys.has(key(r.repo, r.relativePath))) totals.orphanPaths++;
  }

  totals.coverageRate = totals.totalDocs > 0 ? totals.recalledDocs / totals.totalDocs : 0;
  for (const repo of repoAgg.values()) {
    repo.coverageRate = repo.totalDocs > 0 ? repo.recalledDocs / repo.totalDocs : 0;
  }

  return {
    totals,
    repos: [...repoAgg.values()].sort((a, b) => b.recalls - a.recalls),
    domains: [...domainAgg.values()].sort((a, b) => b.recalls - a.recalls),
  };
}
