import { useEffect, useMemo, useState } from 'react';
import { CopyPlus, FileJson, PauseCircle, Pencil, Rocket, Settings2, X } from 'lucide-react';
import { type ProfileConfigAdminDetail, type ProfileConfigAdminSummary, type WorkflowProfileConfig } from '@sdd-telemetry/api';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AdvancedConfigSection } from './AdvancedConfigSection';
import { ContentMapSection } from './ContentMapSection';
import { SkillMappingSection } from './SkillMappingSection';
import { BUTTON_CLASS, ConfigGroup, Field, INPUT_CLASS, PRIMARY_BUTTON_CLASS } from './config-ui';
import {
  useDisableProfileConfig,
  useProfileConfigAdminDetail,
  useProfileConfigAdminList,
  usePublishProfileConfig,
} from './useProfileConfigAdmin';

export default function ProfileConfigAdminPage() {
  const listQuery = useProfileConfigAdminList();
  const items = listQuery.data?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createNonce, setCreateNonce] = useState(0);
  const selected = selectedId ?? items[0]?.profileId ?? null;

  useEffect(() => {
    if (!selectedId && items[0]) setSelectedId(items[0].profileId);
  }, [items, selectedId]);

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: '360px minmax(0, 1fr)' }}>
      <Panel
        title="工作流"
        icon={<Settings2 size={18} />}
        headerRight={
          <button className={BUTTON_CLASS} disabled={!selected} type="button" onClick={() => setCreateNonce((value) => value + 1)}>
            <CopyPlus size={14} /> 新增工作流
          </button>
        }
      >
        <DataTable
          headers={['名称', '状态', '版本']}
          rows={items.map((item) => ({
            key: item.profileId,
            cells: [
              <div key={item.profileId}>
                <div className="text-[12px] font-medium text-[#f5f5f5]">{item.displayName}</div>
                <div className="mt-0.5 text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {item.profileId}
                </div>
              </div>,
              <StatusBadge
                key={`${item.profileId}-status`}
                status={item.status === 'active' ? '启用' : '停用'}
                variant={item.status === 'active' ? 'good' : 'bad'}
              />,
              versionText(item),
            ],
          }))}
          selectedRowKey={selected}
          onRowSelect={(rowKey) => setSelectedId(String(rowKey))}
          emptyText={listQuery.isPending ? '加载中…' : '暂无 Profile'}
        />
        {listQuery.error ? (
          <p className="mt-3 text-[12px] text-[var(--color-bad-text)]">{listQuery.error.message}</p>
        ) : null}
      </Panel>
      <ProfileEditor selectedId={selected} summaries={items} createNonce={createNonce} onSelect={setSelectedId} />
    </div>
  );
}

function ProfileEditor({
  createNonce,
  selectedId,
  summaries,
  onSelect,
}: {
  createNonce: number;
  selectedId: string | null;
  summaries: ProfileConfigAdminSummary[];
  onSelect: (profileId: string | null) => void;
}) {
  const detailQuery = useProfileConfigAdminDetail(selectedId);
  const publish = usePublishProfileConfig();
  const disable = useDisableProfileConfig();
  const [config, setConfig] = useState<WorkflowProfileConfig | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [handledCreateNonce, setHandledCreateNonce] = useState(0);

  useEffect(() => {
    if (detailQuery.data?.config) {
      setConfig(detailQuery.data.config);
      setSavedSnapshot(JSON.stringify(detailQuery.data.config));
      setEditing(false);
    }
  }, [detailQuery.data?.summary.profileId]);

  useEffect(() => {
    if (createNonce > handledCreateNonce && config) {
      beginCreateFromCurrent(config);
      setHandledCreateNonce(createNonce);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createNonce, config, handledCreateNonce]);

  const isNew = Boolean(config && !summaries.some((item) => item.profileId === config.profileId));
  const pending = publish.isPending || disable.isPending;
  const error = publish.error ?? disable.error;
  const configSnapshot = useMemo(() => (config ? JSON.stringify(config) : null), [config]);
  const isDirty = Boolean(configSnapshot && configSnapshot !== savedSnapshot);

  if (!selectedId && !config) return <EmptyState text="请选择工作流" />;
  if (detailQuery.isLoading && !config) {
    return <div className="p-4 text-[13px] text-[var(--color-muted)]">加载中...</div>;
  }
  if (!config) {
    return (
      <Panel title="工作流配置" icon={<FileJson size={18} />}>
        <EmptyState text="请选择工作流" />
      </Panel>
    );
  }

  const activeConfig = config;
  const summary = summaries.find((item) => item.profileId === activeConfig.profileId) ?? detailQuery.data?.summary ?? null;

  function patch(next: Partial<WorkflowProfileConfig>) {
    setConfig((current) => (current ? ({ ...current, ...next } as WorkflowProfileConfig) : current));
  }

  function replace(next: WorkflowProfileConfig) {
    setConfig(next);
  }

  function applyServerDetail(detail: ProfileConfigAdminDetail) {
    setConfig(detail.config);
    setSavedSnapshot(JSON.stringify(detail.config));
    setEditing(false);
    onSelect(detail.summary.profileId);
  }

  function beginCreateFromCurrent(source: WorkflowProfileConfig) {
    const next = {
      ...source,
      profileId: nextProfileId(source.profileId, summaries),
      displayName: `${source.displayName} 副本`,
    } as WorkflowProfileConfig;
    setConfig(next);
    setSavedSnapshot(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (detailQuery.data?.config) {
      setConfig(detailQuery.data.config);
      setSavedSnapshot(JSON.stringify(detailQuery.data.config));
    }
    setEditing(false);
  }

  function submitPublish() {
    publish.mutate(
      {
        profileId: activeConfig.profileId,
        body: { config: activeConfig },
      },
      { onSuccess: applyServerDetail },
    );
  }

  return (
    <Panel
      title="工作流配置"
      icon={<FileJson size={18} />}
      headerRight={
        editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <button className={PRIMARY_BUTTON_CLASS} disabled={pending} type="button" onClick={submitPublish}>
              <Rocket size={14} /> 发布
            </button>
            <button className={BUTTON_CLASS} disabled={pending} type="button" onClick={cancelEdit}>
              <X size={14} /> 取消
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button className={PRIMARY_BUTTON_CLASS} disabled={pending} type="button" onClick={() => setEditing(true)}>
              <Pencil size={14} /> 编辑
            </button>
            <button
              className={BUTTON_CLASS}
              disabled={pending || isNew || activeConfig.status === 'disabled'}
              type="button"
              onClick={() => disable.mutate(activeConfig.profileId, { onSuccess: applyServerDetail })}
            >
              <PauseCircle size={14} /> 停用
            </button>
          </div>
        )
      }
    >
      <div className="grid gap-3">
        <WorkflowIdentitySection
          config={activeConfig}
          isDirty={isDirty}
          isNew={isNew}
          readOnly={!editing}
          summary={summary}
          onPatch={patch}
        />
        <ContentMapSection config={activeConfig} onChange={replace} readOnly={!editing} />
        <SkillMappingSection config={activeConfig} onChange={replace} readOnly={!editing} />
        {editing ? <AdvancedConfigSection config={activeConfig} onApply={replace} /> : null}
        <ValidationIssues detail={detailQuery.data} />
        {error ? <p className="text-[12px] text-[var(--color-bad-text)]">{error.message}</p> : null}
      </div>
    </Panel>
  );
}

function WorkflowIdentitySection({
  config,
  isDirty,
  isNew,
  readOnly,
  summary,
  onPatch,
}: {
  config: WorkflowProfileConfig;
  isDirty: boolean;
  isNew: boolean;
  readOnly: boolean;
  summary: ProfileConfigAdminSummary | null;
  onPatch: (next: Partial<WorkflowProfileConfig>) => void;
}) {
  if (readOnly) {
    return (
      <section className="pb-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold leading-6 text-[#f5f5f5]" title={config.displayName}>
              {config.displayName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--color-muted)]">
              <span className="font-mono text-[var(--color-secondary)]">{config.profileId}</span>
              <span className="text-[var(--color-border)]">/</span>
              <span className="font-mono">{summary ? versionText(summary) : isNew ? '未发布' : '内置'}</span>
              <span className="text-[var(--color-border)]">/</span>
              <span>{isNew ? '新建' : summary?.source === 'builtin' ? '内置' : '数据库'}</span>
              {isDirty ? (
                <>
                  <span className="text-[var(--color-border)]">/</span>
                  <span className="text-[var(--color-warn-text)]">本地修改</span>
                </>
              ) : null}
            </div>
          </div>
          <StatusBadge
            status={config.status === 'active' ? '启用' : '停用'}
            variant={config.status === 'active' ? 'good' : 'bad'}
          />
        </div>
      </section>
    );
  }

  return (
    <ConfigGroup
      title="身份"
      className="border-t-0 pt-0"
      action={
        <StatusBadge
          status={isNew ? '新工作流' : isDirty ? '本地已修改' : '未修改'}
          variant={isNew || isDirty ? 'warn' : 'neutral'}
        />
      }
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Field label="展示名称">
          <input className={INPUT_CLASS} value={config.displayName} onChange={(event) => onPatch({ displayName: event.target.value })} />
        </Field>
        <Field label="状态">
          <select className={INPUT_CLASS} value={config.status} onChange={(event) => onPatch({ status: event.target.value as WorkflowProfileConfig['status'] })}>
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
        </Field>
        <div className="lg:col-span-2">
          <Field label="工作流 ID">
            <input
              className={!isNew ? `${INPUT_CLASS} opacity-60` : INPUT_CLASS}
              disabled={!isNew}
              value={config.profileId}
              onChange={(event) => onPatch({ profileId: normalizeProfileId(event.target.value) })}
            />
          </Field>
        </div>
      </div>
    </ConfigGroup>
  );
}

function ValidationIssues({ detail }: { detail: ProfileConfigAdminDetail | undefined }) {
  const issues = detail?.validation.issues ?? [];
  if (issues.length === 0) return null;
  return (
    <ConfigGroup title="配置问题">
      <div className="grid gap-1.5">
        {issues.map((issue) => (
          <div
            key={`${issue.path ?? issue.ruleId ?? 'config'}-${issue.message}`}
            className="rounded-[4px] border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] px-2 py-1 text-[12px] text-[var(--color-bad-text)]"
          >
            {issue.path ?? issue.ruleId ?? 'config'}: {issue.message}
          </div>
        ))}
      </div>
    </ConfigGroup>
  );
}

function versionText(item: ProfileConfigAdminSummary): string {
  // 版本状态机：serving=真正生效中；published 领先 serving=已发布待投影晋升；
  // 仅 published（未 serving）=待生效；仅 draft=草稿；都没有则内置/未发布。
  if (item.servingVersionNo) {
    if (item.publishedVersionNo && item.publishedVersionNo > item.servingVersionNo) {
      return `生效中 v${item.servingVersionNo} · 待生效 v${item.publishedVersionNo}`;
    }
    return `生效中 v${item.servingVersionNo}`;
  }
  if (item.publishedVersionNo) return `待生效 v${item.publishedVersionNo}`;
  if (item.draftVersionId) return '草稿';
  if (item.source === 'builtin') return '内置';
  return '未发布';
}

function normalizeProfileId(value: string): string {
  return value.trim().replace(/\s+/g, '-');
}

function nextProfileId(profileId: string, summaries: ProfileConfigAdminSummary[]): string {
  const usedIds = new Set(summaries.map((item) => item.profileId));
  let candidate = `${profileId}-copy`;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${profileId}-copy-${index}`;
    index += 1;
  }
  return candidate;
}
