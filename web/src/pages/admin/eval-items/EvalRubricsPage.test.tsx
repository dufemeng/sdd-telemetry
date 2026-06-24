// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RubricOverviewResponse } from '@sdd-telemetry/api';
import EvalRubricsPage from './EvalRubricsPage';

let profileId = 'sdd-default';
let overview: RubricOverviewResponse = overviewFixture();

vi.mock('@/components/layout/useShellContext', () => ({
  useShellContext: () => ({ profileId, timeRange: { kind: 'rolling', window: '7d' } }),
}));

vi.mock('./useEvalRubrics', () => ({
  useRubricOverview: () => ({ data: overview, isPending: false, error: null }),
  useSaveRubricDraft: () => ({ isPending: false, error: null, mutateAsync: vi.fn() }),
  usePublishRubric: () => ({ isPending: false, error: null, mutateAsync: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  profileId = 'sdd-default';
  overview = overviewFixture();
  vi.clearAllMocks();
});

describe('EvalRubricsPage', () => {
  it('renders the builtin rubric when no version has been saved', () => {
    render(<EvalRubricsPage />);

    expect(screen.getByText('尚无已保存版本，当前为内置默认。')).toBeTruthy();
    expect(screen.getByDisplayValue('D1')).toBeTruthy();
    expect(screen.getByText(/满分/).textContent).toContain('2');
    expect(screen.getByRole('button', { name: /保存草稿/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /发布/ })).toBeTruthy();
  });

  it('does not replace local edits during a background refetch for the same key', () => {
    const view = render(<EvalRubricsPage />);
    fireEvent.change(screen.getByDisplayValue('覆盖'), { target: { value: '本地修改' } });

    overview = {
      ...overview,
      builtinDefault: {
        ...overview.builtinDefault,
        dimensions: [{ ...overview.builtinDefault.dimensions[0]!, name: '后台新值' }],
      },
    };
    view.rerender(<EvalRubricsPage />);

    expect(screen.getByDisplayValue('本地修改')).toBeTruthy();
    expect(screen.queryByDisplayValue('后台新值')).toBeNull();
    expect(screen.getByText('未保存修改')).toBeTruthy();
  });
});

function overviewFixture(): RubricOverviewResponse {
  return {
    profileId: 'sdd-default',
    artifactType: 'design',
    active: null,
    draft: null,
    versions: [],
    builtinDefault: {
      judge: { temperature: 0, evidenceRequired: true, context: 'intrinsic' },
      dimensions: [{
        code: 'D1',
        name: '覆盖',
        weight: 1,
        anchors: { '0': '缺失', '1': '部分满足', '2': '完整满足' },
      }],
    },
  };
}
