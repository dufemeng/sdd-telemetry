// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WikiCoverageDomain, WikiCoverageRepo } from '@sdd-telemetry/api';
import { AssetTable } from './AssetTable';

afterEach(() => cleanup());

const repos: WikiCoverageRepo[] = [
  {
    repo: 'trade',
    label: '交易',
    totalDocs: 10,
    recalledDocs: 3,
    coverageRate: 0.3,
    recalls: 12,
    deadDocs: 0,
    newUnreadDocs: 1,
    distinctUsers: 2,
  },
];

const domains: WikiCoverageDomain[] = [
  {
    repo: 'trade',
    domain: 'cashier',
    totalDocs: 10,
    recalledDocs: 3,
    recalls: 12,
    deadDocs: 0,
    newUnreadDocs: 1,
    distinctUsers: 2,
    lastRecallAt: '2026-06-15T10:00:00.000Z',
  },
];

describe('AssetTable', () => {
  it('keeps domain drilldown clickable in recall facts mode', () => {
    const onSelectDomain = vi.fn();

    render(
      <AssetTable
        domains={domains}
        repos={repos}
        degraded={false}
        recallFactsMode
        onSelectDomain={onSelectDomain}
      />,
    );

    expect(screen.getByText('召回文档')).toBeTruthy();
    expect(screen.queryByText('覆盖（已读/库内）')).toBeNull();

    fireEvent.click(screen.getByText('cashier'));

    expect(onSelectDomain).toHaveBeenCalledWith('trade', 'cashier');
  });

  it('keeps domain drilldown clickable when knowledge scan is degraded', () => {
    const onSelectDomain = vi.fn();

    render(
      <AssetTable
        domains={domains}
        repos={repos}
        degraded
        onSelectDomain={onSelectDomain}
      />,
    );

    fireEvent.click(screen.getByText('cashier'));

    expect(onSelectDomain).toHaveBeenCalledWith('trade', 'cashier');
  });
});
