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
});
