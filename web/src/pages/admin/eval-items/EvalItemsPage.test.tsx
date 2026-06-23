// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EvalItemsPage from './EvalItemsPage';

vi.mock('@/components/layout/useShellContext', () => ({
  useShellContext: () => ({ profileId: 'sdd-default', timeRange: { kind: 'rolling', window: '7d' } }),
}));

vi.mock('./useEvalItems', () => ({
  useEvalItemsList: () => ({
    data: {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      summary: { total: 0, enabled: 0, cleaned: 0, manual: 0 },
    },
    isPending: false,
    error: null,
  }),
  useEvalItemDetail: () => ({ data: undefined, isLoading: false, error: null }),
  useImportFromLogs: () => ({ data: undefined, error: null, isPending: false, mutate: vi.fn() }),
  useCreateEvalItem: () => ({ data: undefined, error: null, isPending: false, mutate: vi.fn() }),
  useUpdateEvalItem: () => ({ data: undefined, error: null, isPending: false, mutate: vi.fn() }),
  useDeleteEvalItem: () => ({ data: undefined, error: null, isPending: false, mutate: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EvalItemsPage', () => {
  it('shows import/create CTA on empty state', () => {
    render(<EvalItemsPage />);
    expect(screen.getByText(/暂无样本/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /从日志导入/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /手工新增/ })).toBeTruthy();
  });

  it('shows summary counts', () => {
    render(<EvalItemsPage />);
    expect(screen.getByText(/总数 0/)).toBeTruthy();
    expect(screen.getByText(/启用 0/)).toBeTruthy();
  });
});
