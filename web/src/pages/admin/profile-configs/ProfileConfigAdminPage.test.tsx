// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  E2E_MONOREPO_PROFILE_ID,
  getProfileConfig,
  type ProfileConfigAdminDetail,
  type ProfileConfigAdminSummary,
} from '@sdd-telemetry/api';

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  disable: vi.fn(),
  publish: vi.fn(),
  resetPreview: vi.fn(),
  saveDraft: vi.fn(),
  listQuery: null as unknown,
  detailQuery: null as unknown,
}));

vi.mock('./useProfileConfigAdmin', () => ({
  useCreateProfileConfigDraft: () => ({ error: null, isPending: false, mutate: mocks.createDraft }),
  useDisableProfileConfig: () => ({ error: null, isPending: false, mutate: mocks.disable }),
  useProfileConfigAdminDetail: () => mocks.detailQuery,
  useProfileConfigAdminList: () => mocks.listQuery,
  useProfileConfigPreview: () => ({ data: null, error: null, isPending: false, mutate: vi.fn(), reset: mocks.resetPreview }),
  usePublishProfileConfig: () => ({ error: null, isPending: false, mutate: mocks.publish }),
  useSaveProfileConfigDraft: () => ({ error: null, isPending: false, mutate: mocks.saveDraft }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProfileConfigAdminPage redesign behavior', () => {
  beforeEach(() => {
    const config = getProfileConfig(E2E_MONOREPO_PROFILE_ID)!;
    const summary: ProfileConfigAdminSummary = {
      profileId: config.profileId,
      displayName: config.displayName,
      status: config.status,
      projectionMode: config.projectionMode,
      origin: 'builtin',
      source: 'database',
      publishedVersionId: '13',
      publishedVersionNo: 13,
      servingVersionId: '13',
      servingVersionNo: 13,
      draftVersionId: null,
      definitionHash: 'hash',
      servingDefinitionHash: 'hash',
      publishedAt: null,
      servingAt: null,
      updatedAt: null,
    };
    const detail: ProfileConfigAdminDetail = {
      summary,
      config,
      validation: { valid: true, issues: [] },
      versions: [],
    };
    mocks.listQuery = { data: { items: [summary] }, error: null, isPending: false };
    mocks.detailQuery = { data: detail, isLoading: false };
  });

  it('opens in read-only mode with the old publishing controls removed', async () => {
    const { default: ProfileConfigAdminPage } = await import('./ProfileConfigAdminPage');

    render(<ProfileConfigAdminPage />);

    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新增工作流' })).toBeTruthy();
    expect(screen.queryByText('预览')).toBeNull();
    expect(screen.queryByText('保存草稿')).toBeNull();
    expect(screen.queryByText('发布前检查')).toBeNull();
    expect(screen.queryByText('高级 · 底层完整配置')).toBeNull();
    expect(screen.queryByText('发布备注')).toBeNull();
  });

  it('switches to publish and cancel actions only while editing', async () => {
    const { default: ProfileConfigAdminPage } = await import('./ProfileConfigAdminPage');

    render(<ProfileConfigAdminPage />);

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    expect(screen.getByRole('button', { name: '发布' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy();
    expect(screen.queryByText('编辑')).toBeNull();
    expect(screen.queryByText('预览')).toBeNull();
    expect(screen.queryByText('保存草稿')).toBeNull();
  });

  it('blocks publishing a new workflow whose id collides with an existing one', async () => {
    const { default: ProfileConfigAdminPage } = await import('./ProfileConfigAdminPage');

    render(<ProfileConfigAdminPage />);

    fireEvent.click(screen.getByRole('button', { name: '新增工作流' }));
    // 新建副本默认 id 为 <源 id>-copy，把它改成已存在的 id 触发冲突
    const idInput = screen.getByDisplayValue(`${E2E_MONOREPO_PROFILE_ID}-copy`);
    fireEvent.change(idInput, { target: { value: E2E_MONOREPO_PROFILE_ID } });

    expect(screen.getByText(/已存在/)).toBeTruthy();
    const publishButton = screen.getByRole('button', { name: '发布' }) as HTMLButtonElement;
    expect(publishButton.disabled).toBe(true);
  });

  it('publishes a new workflow with expectNew so the server cannot silently overwrite', async () => {
    const { default: ProfileConfigAdminPage } = await import('./ProfileConfigAdminPage');

    render(<ProfileConfigAdminPage />);

    fireEvent.click(screen.getByRole('button', { name: '新增工作流' }));
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    expect(mocks.publish).toHaveBeenCalledTimes(1);
    const input = mocks.publish.mock.calls[0]?.[0] as { profileId: string; body: { expectNew?: boolean } };
    expect(input.profileId).toBe(`${E2E_MONOREPO_PROFILE_ID}-copy`);
    expect(input.body.expectNew).toBe(true);
  });
});
