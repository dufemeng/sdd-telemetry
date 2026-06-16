import { useEffect, useState } from 'react';
import { CopyPlus, Eye, FileJson, PauseCircle, Rocket, Save, Settings2 } from 'lucide-react';
import { DEFAULT_PROFILE_ERROR_RULES, type ProfileConfigAdminSummary, type WorkflowProfileConfig } from '@sdd-telemetry/api';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AdvancedConfigSection } from './AdvancedConfigSection';
import { ContentMapSection } from './ContentMapSection';
import { SkillMappingSection } from './SkillMappingSection';
import { BUTTON_CLASS, INPUT_CLASS, PRIMARY_BUTTON_CLASS, Section } from './config-ui';
import {
  useCreateProfileConfigDraft,
  useDisableProfileConfig,
  useProfileConfigAdminDetail,
  useProfileConfigAdminList,
  useProfileConfigPreview,
  usePublishProfileConfig,
  useSaveProfileConfigDraft,
} from './useProfileConfigAdmin';

export default function ProfileConfigAdminPage() {
  const listQuery = useProfileConfigAdminList();
  const items = listQuery.data?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ?? items[0]?.profileId ?? null;

  useEffect(() => {
    if (!selectedId && items[0]) setSelectedId(items[0].profileId);
  }, [items, selectedId]);

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(300px,0.7fr)_minmax(0,1.6fr)]">
      <Panel title="工作流" icon={<Settings2 size={18} />}>
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
      <ProfileEditor selectedId={selected} summaries={items} onSelect={setSelectedId} />
    </div>
  );
}

function ProfileEditor({
  selectedId,
  summaries,
  onSelect,
}: {
  selectedId: string | null;
  summaries: ProfileConfigAdminSummary[];
  onSelect: (profileId: string | null) => void;
}) {
  const detailQuery = useProfileConfigAdminDetail(selectedId);
  const previewMutation = useProfileConfigPreview();
  const createDraft = useCreateProfileConfigDraft();
  const saveDraft = useSaveProfileConfigDraft();
  const publish = usePublishProfileConfig();
  const disable = useDisableProfileConfig();
  const [config, setConfig] = useState<WorkflowProfileConfig | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (detailQuery.data?.config) {
      setConfig(detailQuery.data.config);
      setNotes('');
      previewMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQuery.data?.summary.profileId]);

  const isNew = Boolean(config && !summaries.some((item) => item.profileId === config.profileId));
  const pending =
    createDraft.isPending || saveDraft.isPending || publish.isPending || disable.isPending || previewMutation.isPending;
  const error = createDraft.error ?? saveDraft.error ?? publish.error ?? disable.error ?? previewMutation.error;

  if (!selectedId && !config) return <EmptyState text="请选择工作流" />;
  if (detailQuery.isLoading && !config) {
    return <div className="p-4 text-[13px] text-[var(--color-muted)]">加载中…</div>;
  }
  if (!config) {
    return (
      <Panel title="工作流配置" icon={<FileJson size={18} />}>
        <button className={PRIMARY_BUTTON_CLASS} type="button" onClick={() => setConfig(scaffoldProfileConfig())}>
          <CopyPlus size={14} /> 新建工作流
        </button>
      </Panel>
    );
  }
  const activeConfig = config;

  function patch(next: Partial<WorkflowProfileConfig>) {
    setConfig((current) => (current ? ({ ...current, ...next } as WorkflowProfileConfig) : current));
    previewMutation.reset();
  }
  function replace(next: WorkflowProfileConfig) {
    setConfig(next);
    previewMutation.reset();
  }

  function submitDraft() {
    const body = { config: activeConfig, ...(notes.trim() ? { notes: notes.trim() } : {}) };
    if (isNew) {
      createDraft.mutate(body, { onSuccess: (detail) => onSelect(detail.summary.profileId) });
      return;
    }
    saveDraft.mutate({ profileId: activeConfig.profileId, body });
  }
  function submitPublish() {
    publish.mutate({
      profileId: activeConfig.profileId,
      body: { config: activeConfig, ...(notes.trim() ? { notes: notes.trim() } : {}) },
    });
  }
  function createFromCurrent() {
    replace({
      ...activeConfig,
      profileId: `${activeConfig.profileId}-copy`,
      displayName: `${activeConfig.displayName} 副本`,
      status: 'disabled',
    } as WorkflowProfileConfig);
    onSelect(null);
  }

  const preview = previewMutation.data;
  const canPublish = Boolean(preview?.validation.valid && preview.runtime.configured);

  return (
    <Panel
      title="工作流配置"
      icon={<FileJson size={18} />}
      headerRight={
        <div className="flex flex-wrap gap-2">
          <button className={BUTTON_CLASS} type="button" onClick={createFromCurrent}>
            <CopyPlus size={14} /> 复制
          </button>
          <button className={BUTTON_CLASS} type="button" disabled={pending} onClick={() => previewMutation.mutate({ config: activeConfig })}>
            <Eye size={14} /> 预览
          </button>
          <button className={BUTTON_CLASS} type="button" disabled={pending} onClick={submitDraft}>
            <Save size={14} /> 保存草稿
          </button>
          <button className={PRIMARY_BUTTON_CLASS} type="button" disabled={pending || !canPublish} onClick={submitPublish}>
            <Rocket size={14} /> 发布
          </button>
        </div>
      }
    >
      <div className="grid gap-3">
        <Section title="基础信息">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="工作流 ID（系统内部标识,发布后别改）">
              <input
                className={selectedId ? `${INPUT_CLASS} opacity-60` : INPUT_CLASS}
                disabled={Boolean(selectedId)}
                value={config.profileId}
                onChange={(event) => patch({ profileId: event.target.value.trim().replace(/\s+/g, '-') })}
              />
            </Field>
            <Field label="展示名称">
              <input className={INPUT_CLASS} value={config.displayName} onChange={(event) => patch({ displayName: event.target.value })} />
            </Field>
            <Field label="状态">
              <select className={INPUT_CLASS} value={config.status} onChange={(event) => patch({ status: event.target.value as WorkflowProfileConfig['status'] })}>
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </Field>
          </div>
        </Section>

        <ContentMapSection config={activeConfig} onChange={replace} />
        <SkillMappingSection config={activeConfig} onChange={replace} />

        <Section title="发布前检查">
          {!preview ? (
            <p className="text-[12px] text-[var(--color-muted)]">点上方「预览」,用最近的真实数据校验这套配置能不能跑。</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <PreviewStat label="校验结果" value={preview.validation.valid ? '通过' : `${preview.validation.issues.length} 个问题`} />
              <PreviewStat label="生效规则数" value={String(preview.runtime.resolvedRuleCount)} />
            </div>
          )}
          {(preview?.validation.issues.length ?? 0) > 0 ? (
            <IssueList issues={preview!.validation.issues.map((issue) => `${issue.path ?? issue.ruleId ?? 'config'}: ${issue.message}`)} />
          ) : null}
          {(preview?.runtime.unresolved.length ?? 0) > 0 ? (
            <IssueList issues={preview!.runtime.unresolved.map((item) => `${item.ruleId}: ${item.reason}`)} />
          ) : null}
        </Section>

        <AdvancedConfigSection config={activeConfig} onApply={replace} />

        <Section title="发布备注">
          <textarea
            className={`${INPUT_CLASS} min-h-[60px] py-2 resize-y`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={BUTTON_CLASS}
              type="button"
              disabled={pending || config.status === 'disabled'}
              onClick={() => disable.mutate(activeConfig.profileId)}
            >
              <PauseCircle size={14} /> 停用
            </button>
          </div>
        </Section>

        {error ? <p className="text-[12px] text-[var(--color-bad-text)]">{error.message}</p> : null}
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-[var(--color-border)] bg-[#141414] px-3 py-2">
      <div className="text-[11px] text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-[#f5f5f5]">{value}</div>
    </div>
  );
}

function IssueList({ issues }: { issues: string[] }) {
  return (
    <div className="mt-3 grid gap-1">
      {issues.map((issue) => (
        <div
          key={issue}
          className="rounded-[4px] border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] px-2 py-1 text-[12px] text-[var(--color-bad-text)]"
        >
          {issue}
        </div>
      ))}
    </div>
  );
}

function versionText(item: ProfileConfigAdminSummary): string {
  if (!item.publishedVersionNo && item.source === 'builtin') return '内置';
  if (item.servingVersionNo) return `生效中 v${item.servingVersionNo}`;
  if (item.publishedVersionNo) return `草稿 v${item.publishedVersionNo}`;
  return '未发布';
}

/** 新建 profile 的脚手架:source_backed + 三类内容路径规则 + 技能兜底,简单视图可直接编辑。 */
function scaffoldProfileConfig(): WorkflowProfileConfig {
  return {
    profileId: 'new-profile',
    displayName: 'New Profile',
    status: 'disabled',
    projectionMode: 'source_backed',
    manifest: {
      capabilityUsage: true,
      deliveryUnits: true,
      artifacts: true,
      artifactTimeline: true,
      knowledgeRecalls: true,
      codeChanges: true,
      errors: true,
      evaluation: false,
      alerts: false,
    },
    sourceRules: [
      { locatorType: 'path', ruleId: 'knowledge', category: 'knowledge', priority: 90, confidence: 'high', enabled: true, pathContains: [], actions: ['read', 'grep', 'glob'] },
      { locatorType: 'path', ruleId: 'process-doc', category: 'process_doc', priority: 85, confidence: 'high', enabled: true, pathContains: [], actions: ['read', 'write', 'edit', 'update'] },
      { locatorType: 'path', ruleId: 'code', category: 'code', priority: 20, confidence: 'high', enabled: true, pathContains: [], excludeGlobs: ['**/*.md', '**/dist/**', '**/node_modules/**'], actions: ['write', 'edit', 'update', 'delete'] },
      { locatorType: 'skill', ruleId: 'skill-other', category: 'skill', priority: 1, confidence: 'high', enabled: true, skillNames: ['*'], actions: ['invoke'] },
    ],
    deliveryUnitRules: [
      { ruleId: 'process-doc-unit', sourceRuleIds: ['process-doc'], locatorStrategy: { kind: 'parent_dir', stripExtensions: true }, titleStrategy: 'unit_slug' },
    ],
    artifactRules: [{ ruleId: 'process-doc-artifact', sourceRuleIds: ['process-doc'], typePatterns: [], defaultArtifactType: 'process_doc' }],
    capabilityRules: [{ ruleId: 'cap-other-skill', sourceRuleIds: ['skill-other'], actions: ['invoke'], capabilityCode: 'other-skill', displayName: '其他技能' }],
    errorRules: DEFAULT_PROFILE_ERROR_RULES,
    attributionPolicy: {
      anchorCategories: ['process_doc'],
      anchorActions: ['write', 'edit', 'update'],
      sameInteraction: { enabled: true, preferActions: ['write', 'edit', 'update'] },
      sameSessionWindow: { enabled: true, minutes: 120, requireSameUser: true, preferActions: ['write', 'edit', 'update'] },
    },
    presentation: {
      workflowKind: 'local_path_monorepo',
      maturityStages: [],
      artifactStageOrder: ['process_doc'],
      hiddenMetrics: ['maturity'],
      knowledgeCoverageMode: 'recall_facts',
    },
  };
}
