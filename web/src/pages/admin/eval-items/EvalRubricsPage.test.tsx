// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RubricOverviewResponse, RubricVersion } from '@sdd-telemetry/api';
import EvalRubricsPage from './EvalRubricsPage';

let profileId = 'sdd-default';
let overview: RubricOverviewResponse = overviewFixture();
const mutations = vi.hoisted(() => ({
  saveDraft: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('@/components/layout/useShellContext', () => ({
  useShellContext: () => ({ profileId, timeRange: { kind: 'rolling', window: '7d' } }),
}));

vi.mock('./useEvalRubrics', () => ({
  useRubricOverview: () => ({ data: overview, isPending: false, error: null }),
  useSaveRubricDraft: () => ({ isPending: false, error: null, mutateAsync: mutations.saveDraft }),
  usePublishRubric: () => ({ isPending: false, error: null, mutateAsync: mutations.publish }),
}));

beforeEach(() => {
  mutations.saveDraft.mockResolvedValue({ id: 'draft-1', versionNo: 1, versionStatus: 'draft' });
  mutations.publish.mockResolvedValue({ id: 'draft-1', versionNo: 1, versionStatus: 'published' });
});

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
    expect((screen.getByRole('button', { name: /保存草稿/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /发布/ }) as HTMLButtonElement).disabled).toBe(false);
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

  it('disables no-op persistence when only an unchanged active version exists', () => {
    const active = versionFixture('published');
    overview = { ...overview, active, versions: [active] };

    render(<EvalRubricsPage />);

    expect((screen.getByRole('button', { name: /保存草稿/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /发布/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('publishes an unchanged existing draft without saving it again', async () => {
    const draft = versionFixture('draft');
    overview = { ...overview, draft, versions: [draft] };

    render(<EvalRubricsPage />);
    const saveButton = screen.getByRole('button', { name: /保存草稿/ }) as HTMLButtonElement;
    const publishButton = screen.getByRole('button', { name: /发布/ }) as HTMLButtonElement;

    expect(saveButton.disabled).toBe(true);
    expect(publishButton.disabled).toBe(false);
    fireEvent.click(publishButton);

    await waitFor(() => expect(mutations.publish).toHaveBeenCalledWith('version-1'));
    expect(mutations.saveDraft).not.toHaveBeenCalled();
  });

  it('trims dimension codes before saving', async () => {
    render(<EvalRubricsPage />);
    fireEvent.change(screen.getByDisplayValue('D1'), { target: { value: ' D1 ' } });
    fireEvent.click(screen.getByRole('button', { name: /保存草稿/ }));

    await waitFor(() => expect(mutations.saveDraft).toHaveBeenCalled());
    expect(mutations.saveDraft.mock.calls[0]?.[0].dimensions[0].code).toBe('D1');
  });
});

function versionFixture(versionStatus: 'draft' | 'published'): RubricVersion {
  return {
    id: 'version-1',
    profileId: 'sdd-default',
    artifactType: 'design',
    versionNo: 1,
    versionStatus,
    definitionHash: 'a'.repeat(64),
    publishedAt: versionStatus === 'published' ? '2026-06-23T00:00:00.000Z' : null,
    gmtModified: '2026-06-23T00:00:00.000Z',
    rubric: overviewFixture().builtinDefault,
  };
}

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
