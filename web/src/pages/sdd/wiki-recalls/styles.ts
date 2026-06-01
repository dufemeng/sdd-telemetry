export const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' } as const;
export const ICON_BOX = { background: '#141409', color: 'var(--color-primary)' } as const;

export type RepoKey = 'trade' | 'loan' | 'wealth';
export const REPO_LABEL: Record<string, string> = { trade: '交易', loan: '融资', wealth: '理财' };
export const REPO_COLOR: Record<string, string> = {
  trade: 'var(--color-bar-fill)',
  loan: '#60a5fa',
  wealth: 'var(--color-good-text)',
};

export function repoTagStyle(repo: string): React.CSSProperties {
  const color = REPO_COLOR[repo] ?? 'var(--color-secondary)';
  return { color, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)' };
}

export function coverFillColor(rate: number): string {
  return rate >= 0.65 ? 'var(--color-good-text)' : rate >= 0.45 ? 'var(--color-warn-text)' : 'var(--color-bad-text)';
}
