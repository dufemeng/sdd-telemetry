import { useEffect, useMemo, useState } from 'react';
import { CopyPlus, Eye, FileJson, PauseCircle, Rocket, Save, Settings2, Trash2 } from 'lucide-react';
import type {
  ArtifactRule,
  CapabilityRule,
  DeliveryUnitRule,
  ProfileConfigAdminSummary,
  SourceAction,
  SourceRule,
  WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  useCreateProfileConfigDraft,
  useDisableProfileConfig,
  useProfileConfigAdminDetail,
  useProfileConfigAdminList,
  useProfileConfigPreview,
  usePublishProfileConfig,
  useSaveProfileConfigDraft,
} from './useProfileConfigAdmin';

const INPUT_CLASS =
  'w-full min-h-8 px-[10px] rounded-[4px] text-[12px] text-[var(--color-text)] outline-none bg-[var(--color-base)] border border-[var(--color-border)] focus:border-[rgba(250,255,105,0.55)] transition-colors';
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-[72px] py-2 resize-y`;
const BUTTON_CLASS = 'inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[var(--color-border)] px-3 text-[12px] text-[var(--color-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50';
const PRIMARY_BUTTON_CLASS = 'inline-flex h-8 items-center gap-1.5 rounded-[4px] border-0 bg-[var(--color-primary)] px-3 text-[12px] font-bold text-[var(--color-base)] disabled:opacity-60';

export default function ProfileConfigAdminPage() {
  const listQuery = useProfileConfigAdminList();
  const items = listQuery.data?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ?? items[0]?.profileId ?? null;

  useEffect(() => {
    if (!selectedId && items[0]) setSelectedId(items[0].profileId);
  }, [items, selectedId]);

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.6fr)]">
      <Panel title="Profile" icon={<Settings2 size={18} />}>
        <DataTable
          headers={['名称', '状态', '模式', '版本']}
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
              modeText(item.projectionMode),
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedText, setAdvancedText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (detailQuery.data?.config) {
      setConfig(detailQuery.data.config);
      setAdvancedText(JSON.stringify(detailQuery.data.config, null, 2));
      setNotes('');
      setJsonError(null);
      previewMutation.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQuery.data?.summary.profileId]);

  const isNew = Boolean(config && !summaries.some((item) => item.profileId === config.profileId));
  const pending = createDraft.isPending || saveDraft.isPending || publish.isPending || disable.isPending || previewMutation.isPending;
  const error = createDraft.error ?? saveDraft.error ?? publish.error ?? disable.error ?? previewMutation.error;

  if (!selectedId && !config) {
    return <EmptyState text="请选择 Profile" />;
  }
  if (detailQuery.isLoading && !config) {
    return <div className="p-4 text-[13px] text-[var(--color-muted)]">加载中…</div>;
  }
  if (!config) {
    return (
      <Panel title="Profile 编辑" icon={<FileJson size={18} />}>
        <button
          className={PRIMARY_BUTTON_CLASS}
          type="button"
          onClick={() => {
            const next = emptyProfileConfig();
            setConfig(next);
            setAdvancedText(JSON.stringify(next, null, 2));
            previewMutation.reset();
          }}
        >
          <CopyPlus size={14} /> 新建 Profile
        </button>
      </Panel>
    );
  }
  const activeConfig = config;

  function update(patch: Partial<WorkflowProfileConfig>) {
    setConfig((current) => current ? { ...current, ...patch } as WorkflowProfileConfig : current);
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

  function submitPreview() {
    previewMutation.mutate({ config: activeConfig });
  }

  function submitPublish() {
    publish.mutate({
      profileId: activeConfig.profileId,
      body: { config: activeConfig, ...(notes.trim() ? { notes: notes.trim() } : {}) },
    });
  }

  function submitDisable() {
    disable.mutate(activeConfig.profileId);
  }

  function createFromCurrent() {
    const next = {
      ...activeConfig,
      profileId: `${activeConfig.profileId}-copy`,
      displayName: `${activeConfig.displayName} Copy`,
      status: 'disabled',
    } as WorkflowProfileConfig;
    setConfig(next);
    setAdvancedText(JSON.stringify(next, null, 2));
    previewMutation.reset();
    onSelect(null);
  }

  function applyAdvancedJson() {
    try {
      const parsed = JSON.parse(advancedText) as WorkflowProfileConfig;
      setConfig(parsed);
      setJsonError(null);
      previewMutation.reset();
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    }
  }

  const preview = previewMutation.data;
  const canPublish = Boolean(preview?.validation.valid && preview.runtime.configured);

  return (
    <Panel
      title="Profile 编辑"
      icon={<FileJson size={18} />}
      headerRight={
        <div className="flex flex-wrap gap-2">
          <button className={BUTTON_CLASS} type="button" onClick={createFromCurrent}>
            <CopyPlus size={14} /> 复制
          </button>
          <button className={BUTTON_CLASS} type="button" disabled={pending} onClick={submitPreview}>
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
      <div className="grid gap-4">
        <Section title="基础信息">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Profile ID">
              <input
                className={selectedId ? `${INPUT_CLASS} opacity-60` : INPUT_CLASS}
                disabled={Boolean(selectedId)}
                value={config.profileId}
                onChange={(event) => update({ profileId: slugValue(event.target.value) })}
              />
            </Field>
            <Field label="展示名称">
              <input className={INPUT_CLASS} value={config.displayName} onChange={(event) => update({ displayName: event.target.value })} />
            </Field>
            <Field label="状态">
              <select className={INPUT_CLASS} value={config.status} onChange={(event) => update({ status: event.target.value as WorkflowProfileConfig['status'] })}>
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </Field>
            <Field label="投影模式">
              <select className={INPUT_CLASS} value={config.projectionMode} onChange={(event) => update({ projectionMode: event.target.value as WorkflowProfileConfig['projectionMode'] })}>
                <option value="sdd_bridge">SDD Bridge</option>
                <option value="source_backed">Source Backed</option>
              </select>
            </Field>
          </div>
          <ManifestEditor config={config} onChange={update} />
        </Section>

        <SourceRulesEditor config={config} onChange={update} />
        <CapabilityRulesEditor config={config} onChange={update} />
        <DeliveryUnitRulesEditor config={config} onChange={update} />
        <ArtifactRulesEditor config={config} onChange={update} />
        <PresentationEditor config={config} onChange={update} />

        <Section title="发布前预览">
          <div className="grid gap-3 md:grid-cols-3">
            <PreviewStat label="配置 Hash" value={preview?.definitionHash.slice(0, 12) ?? '-'} />
            <PreviewStat label="校验结果" value={preview ? (preview.validation.valid ? '通过' : `${preview.validation.issues.length} 个问题`) : '-'} />
            <PreviewStat label="已解析规则" value={preview ? String(preview.runtime.resolvedRuleCount) : '-'} />
          </div>
          {(preview?.validation.issues.length ?? 0) > 0 ? (
            <IssueList issues={preview!.validation.issues.map((issue) => `${issue.path ?? issue.ruleId ?? 'config'}: ${issue.message}`)} />
          ) : null}
          {(preview?.runtime.unresolved.length ?? 0) > 0 ? (
            <IssueList issues={preview!.runtime.unresolved.map((item) => `${item.ruleId}: ${item.reason}`)} />
          ) : null}
        </Section>

        <Section title="发布备注">
          <textarea className={TEXTAREA_CLASS} value={notes} onChange={(event) => setNotes(event.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={BUTTON_CLASS} type="button" disabled={pending || config.status === 'disabled'} onClick={submitDisable}>
              <PauseCircle size={14} /> 停用
            </button>
          </div>
        </Section>

        <Section title="高级模式">
          <button className={BUTTON_CLASS} type="button" onClick={() => setAdvancedOpen((value) => !value)}>
            {advancedOpen ? '收起 JSON' : '展开 JSON'}
          </button>
          {advancedOpen ? (
            <div className="mt-3 grid gap-2">
              <textarea className={`${TEXTAREA_CLASS} min-h-[320px] font-mono`} value={advancedText} onChange={(event) => setAdvancedText(event.target.value)} />
              <button className={BUTTON_CLASS} type="button" onClick={applyAdvancedJson}>应用 JSON</button>
              {jsonError ? <p className="text-[12px] text-[var(--color-bad-text)]">{jsonError}</p> : null}
            </div>
          ) : null}
        </Section>

        {error ? <p className="text-[12px] text-[var(--color-bad-text)]">{error.message}</p> : null}
      </div>
    </Panel>
  );
}

function ManifestEditor({ config, onChange }: EditorProps) {
  const entries = Object.entries(config.manifest) as Array<[keyof WorkflowProfileConfig['manifest'], boolean]>;
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-3">
      {entries.map(([key, value]) => (
        <label key={key} className="flex h-8 items-center gap-2 rounded-[4px] border border-[var(--color-border)] px-2 text-[12px] text-[var(--color-secondary)]">
          <input
            type="checkbox"
            checked={value}
            onChange={(event) => onChange({ manifest: { ...config.manifest, [key]: event.target.checked } })}
          />
          <span>{manifestLabel(key)}</span>
        </label>
      ))}
    </div>
  );
}

function SourceRulesEditor({ config, onChange }: EditorProps) {
  function updateRule(index: number, patch: Record<string, unknown>) {
    const sourceRules = config.sourceRules.map((rule, i) => i === index ? { ...rule, ...patch } as SourceRule : rule);
    onChange({ sourceRules });
  }
  function changeType(index: number, locatorType: SourceRule['locatorType']) {
    const current = config.sourceRules[index]!;
    const base = {
      ruleId: current.ruleId,
      priority: current.priority,
      confidence: current.confidence,
      enabled: current.enabled,
      category: current.category,
      actions: current.actions,
      description: current.description,
    };
    const next =
      locatorType === 'path'
        ? { ...base, locatorType, pathContains: [] }
        : locatorType === 'url'
          ? { ...base, locatorType, urlPrefixes: [] }
          : { ...base, locatorType, docIdPatterns: [] };
    updateRule(index, next);
  }
  return (
    <Section
      title="数据来源规则"
      action={<button className={BUTTON_CLASS} type="button" onClick={() => onChange({ sourceRules: [...config.sourceRules, newSourceRule(config.sourceRules.length)] })}>新增</button>}
    >
      <div className="grid gap-3">
        {config.sourceRules.map((rule, index) => (
          <RuleBox key={`${rule.ruleId}-${index}`} title={rule.ruleId || `source-${index + 1}`} onDelete={() => onChange({ sourceRules: config.sourceRules.filter((_, i) => i !== index) })}>
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Rule ID"><input className={INPUT_CLASS} value={rule.ruleId} onChange={(event) => updateRule(index, { ruleId: slugValue(event.target.value) })} /></Field>
              <Field label="类型">
                <select className={INPUT_CLASS} value={rule.locatorType} onChange={(event) => changeType(index, event.target.value as SourceRule['locatorType'])}>
                  <option value="path">Path</option>
                  <option value="url">URL</option>
                  <option value="mcp_doc">MCP Doc</option>
                </select>
              </Field>
              <Field label="类别">
                <select className={INPUT_CLASS} value={rule.category} onChange={(event) => updateRule(index, { category: event.target.value })}>
                  <option value="process_doc">过程文档</option>
                  <option value="knowledge">知识</option>
                  <option value="code">代码</option>
                  <option value="unknown">未知</option>
                </select>
              </Field>
              <Field label="动作"><input className={INPUT_CLASS} value={rule.actions.join(', ')} onChange={(event) => updateRule(index, { actions: parseActions(event.target.value) })} /></Field>
              <Field label="优先级"><input className={INPUT_CLASS} type="number" value={rule.priority} onChange={(event) => updateRule(index, { priority: Number(event.target.value) })} /></Field>
              <Field label="置信度">
                <select className={INPUT_CLASS} value={rule.confidence} onChange={(event) => updateRule(index, { confidence: event.target.value })}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </Field>
              <Field label="启用">
                <select className={INPUT_CLASS} value={rule.enabled ? 'true' : 'false'} onChange={(event) => updateRule(index, { enabled: event.target.value === 'true' })}>
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </Field>
            </div>
            <SourceRuleMatcherFields rule={rule} onPatch={(patch) => updateRule(index, patch)} />
          </RuleBox>
        ))}
      </div>
    </Section>
  );
}

function SourceRuleMatcherFields({ rule, onPatch }: { rule: SourceRule; onPatch: (patch: Record<string, unknown>) => void }) {
  if (rule.locatorType === 'path') {
    return (
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Root Env"><input className={INPUT_CLASS} value={rule.rootEnv ?? ''} onChange={(event) => onPatch({ rootEnv: emptyToUndefined(event.target.value) })} /></Field>
        <Field label="Fallback Env"><input className={INPUT_CLASS} value={rule.fallbackBaseEnv ?? ''} onChange={(event) => onPatch({ fallbackBaseEnv: emptyToUndefined(event.target.value) })} /></Field>
        <Field label="Relative Root"><input className={INPUT_CLASS} value={rule.relativeRoot ?? ''} onChange={(event) => onPatch({ relativeRoot: emptyToUndefined(event.target.value) })} /></Field>
        <Field label="Path Contains"><textarea className={TEXTAREA_CLASS} value={(rule.pathContains ?? []).join('\n')} onChange={(event) => onPatch({ pathContains: parseLines(event.target.value) })} /></Field>
        <Field label="Include Globs"><textarea className={TEXTAREA_CLASS} value={(rule.includeGlobs ?? []).join('\n')} onChange={(event) => onPatch({ includeGlobs: parseLines(event.target.value) })} /></Field>
        <Field label="Exclude Globs"><textarea className={TEXTAREA_CLASS} value={(rule.excludeGlobs ?? []).join('\n')} onChange={(event) => onPatch({ excludeGlobs: parseLines(event.target.value) })} /></Field>
      </div>
    );
  }
  if (rule.locatorType === 'url') {
    return (
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="URL Prefixes"><textarea className={TEXTAREA_CLASS} value={(rule.urlPrefixes ?? []).join('\n')} onChange={(event) => onPatch({ urlPrefixes: parseLines(event.target.value) })} /></Field>
        <Field label="URL Regexes"><textarea className={TEXTAREA_CLASS} value={(rule.urlRegexes ?? []).join('\n')} onChange={(event) => onPatch({ urlRegexes: parseLines(event.target.value) })} /></Field>
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <Field label="Doc ID Patterns"><textarea className={TEXTAREA_CLASS} value={(rule.docIdPatterns ?? []).join('\n')} onChange={(event) => onPatch({ docIdPatterns: parseLines(event.target.value) })} /></Field>
      <Field label="Collection IDs"><textarea className={TEXTAREA_CLASS} value={(rule.collectionIds ?? []).join('\n')} onChange={(event) => onPatch({ collectionIds: parseLines(event.target.value) })} /></Field>
      <Field label="Doc Types"><textarea className={TEXTAREA_CLASS} value={(rule.docTypes ?? []).join('\n')} onChange={(event) => onPatch({ docTypes: parseLines(event.target.value) })} /></Field>
      <Field label="URL Prefixes"><textarea className={TEXTAREA_CLASS} value={(rule.urlPrefixes ?? []).join('\n')} onChange={(event) => onPatch({ urlPrefixes: parseLines(event.target.value) })} /></Field>
    </div>
  );
}

function CapabilityRulesEditor({ config, onChange }: EditorProps) {
  function updateRule(index: number, patch: Partial<CapabilityRule>) {
    onChange({ capabilityRules: config.capabilityRules.map((rule, i) => i === index ? { ...rule, ...patch } as CapabilityRule : rule) });
  }
  return (
    <Section title="能力规则" action={<button className={BUTTON_CLASS} type="button" onClick={() => onChange({ capabilityRules: [...config.capabilityRules, newCapabilityRule(config.capabilityRules.length)] })}>新增</button>}>
      <div className="grid gap-3">
        {config.capabilityRules.map((rule, index) => (
          <RuleBox key={`${rule.ruleId}-${index}`} title={rule.displayName || rule.ruleId} onDelete={() => onChange({ capabilityRules: config.capabilityRules.filter((_, i) => i !== index) })}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Rule ID"><input className={INPUT_CLASS} value={rule.ruleId} onChange={(event) => updateRule(index, { ruleId: slugValue(event.target.value) })} /></Field>
              <Field label="能力编码"><input className={INPUT_CLASS} value={rule.capabilityCode} onChange={(event) => updateRule(index, { capabilityCode: slugValue(event.target.value) })} /></Field>
              <Field label="展示名"><input className={INPUT_CLASS} value={rule.displayName} onChange={(event) => updateRule(index, { displayName: event.target.value })} /></Field>
              <Field label="动作"><input className={INPUT_CLASS} value={rule.actions.join(', ')} onChange={(event) => updateRule(index, { actions: parseActions(event.target.value) })} /></Field>
              <Field label="Source Rule IDs"><input className={INPUT_CLASS} value={(rule.sourceRuleIds ?? []).join(', ')} onChange={(event) => updateRule(index, { sourceRuleIds: parseCsv(event.target.value) })} /></Field>
              <Field label="Source Categories"><input className={INPUT_CLASS} value={(rule.sourceCategories ?? []).join(', ')} onChange={(event) => updateRule(index, { sourceCategories: parseCsv(event.target.value) as CapabilityRule['sourceCategories'] })} /></Field>
            </div>
          </RuleBox>
        ))}
      </div>
    </Section>
  );
}

function DeliveryUnitRulesEditor({ config, onChange }: EditorProps) {
  function updateRule(index: number, patch: Partial<DeliveryUnitRule>) {
    onChange({ deliveryUnitRules: config.deliveryUnitRules.map((rule, i) => i === index ? { ...rule, ...patch } as DeliveryUnitRule : rule) });
  }
  return (
    <Section title="交付单元规则" action={<button className={BUTTON_CLASS} type="button" onClick={() => onChange({ deliveryUnitRules: [...config.deliveryUnitRules, newDeliveryUnitRule(config.deliveryUnitRules.length)] })}>新增</button>}>
      <div className="grid gap-3">
        {config.deliveryUnitRules.map((rule, index) => (
          <RuleBox key={`${rule.ruleId}-${index}`} title={rule.ruleId} onDelete={() => onChange({ deliveryUnitRules: config.deliveryUnitRules.filter((_, i) => i !== index) })}>
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Rule ID"><input className={INPUT_CLASS} value={rule.ruleId} onChange={(event) => updateRule(index, { ruleId: slugValue(event.target.value) })} /></Field>
              <Field label="Source Rule IDs"><input className={INPUT_CLASS} value={rule.sourceRuleIds.join(', ')} onChange={(event) => updateRule(index, { sourceRuleIds: parseCsv(event.target.value) })} /></Field>
              <Field label="定位策略">
                <select className={INPUT_CLASS} value={rule.locatorStrategy.kind} onChange={(event) => updateRule(index, { locatorStrategy: defaultLocatorStrategy(event.target.value as DeliveryUnitRule['locatorStrategy']['kind']) })}>
                  <option value="parent_dir">Parent Dir</option>
                  <option value="path_segment">Path Segment</option>
                  <option value="url_resource_id">URL Resource</option>
                  <option value="mcp_doc_id">MCP Doc</option>
                </select>
              </Field>
              <Field label="标题来源">
                <select className={INPUT_CLASS} value={rule.titleStrategy ?? 'unit_slug'} onChange={(event) => updateRule(index, { titleStrategy: event.target.value as DeliveryUnitRule['titleStrategy'] })}>
                  <option value="unit_slug">Unit Slug</option>
                  <option value="file_name">File Name</option>
                  <option value="doc_title">Doc Title</option>
                  <option value="none">None</option>
                </select>
              </Field>
            </div>
          </RuleBox>
        ))}
      </div>
    </Section>
  );
}

function ArtifactRulesEditor({ config, onChange }: EditorProps) {
  function updateRule(index: number, patch: Partial<ArtifactRule>) {
    onChange({ artifactRules: config.artifactRules.map((rule, i) => i === index ? { ...rule, ...patch } as ArtifactRule : rule) });
  }
  return (
    <Section title="产物规则" action={<button className={BUTTON_CLASS} type="button" onClick={() => onChange({ artifactRules: [...config.artifactRules, newArtifactRule(config.artifactRules.length)] })}>新增</button>}>
      <div className="grid gap-3">
        {config.artifactRules.map((rule, index) => (
          <RuleBox key={`${rule.ruleId}-${index}`} title={rule.ruleId} onDelete={() => onChange({ artifactRules: config.artifactRules.filter((_, i) => i !== index) })}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Rule ID"><input className={INPUT_CLASS} value={rule.ruleId} onChange={(event) => updateRule(index, { ruleId: slugValue(event.target.value) })} /></Field>
              <Field label="Source Rule IDs"><input className={INPUT_CLASS} value={rule.sourceRuleIds.join(', ')} onChange={(event) => updateRule(index, { sourceRuleIds: parseCsv(event.target.value) })} /></Field>
              <Field label="默认类型"><input className={INPUT_CLASS} value={rule.defaultArtifactType} onChange={(event) => updateRule(index, { defaultArtifactType: slugValue(event.target.value) })} /></Field>
              <Field label="类型匹配">
                <textarea className={TEXTAREA_CLASS} value={formatTypePatterns(rule.typePatterns)} onChange={(event) => updateRule(index, { typePatterns: parseTypePatterns(event.target.value) })} />
              </Field>
            </div>
          </RuleBox>
        ))}
      </div>
    </Section>
  );
}

function PresentationEditor({ config, onChange }: EditorProps) {
  const presentation = config.presentation;
  const labels = presentation.labels ?? {
    dashboardTitle: '',
    deliveryUnitSingular: '',
    deliveryUnitPlural: '',
    artifactSingular: '',
    artifactPlural: '',
    capabilitySingular: '',
    capabilityPlural: '',
    knowledgeSingular: '',
    knowledgePlural: '',
  };
  return (
    <Section title="展示文案">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="工作流类型">
          <select className={INPUT_CLASS} value={presentation.workflowKind} onChange={(event) => onChange({ presentation: { ...presentation, workflowKind: event.target.value as WorkflowProfileConfig['presentation']['workflowKind'] } })}>
            <option value="sdd">SDD</option>
            <option value="local_path_monorepo">Local Path Monorepo</option>
            <option value="online_docs">Online Docs</option>
          </select>
        </Field>
        <Field label="知识覆盖口径">
          <select className={INPUT_CLASS} value={presentation.knowledgeCoverageMode} onChange={(event) => onChange({ presentation: { ...presentation, knowledgeCoverageMode: event.target.value as WorkflowProfileConfig['presentation']['knowledgeCoverageMode'] } })}>
            <option value="filesystem_scan">Filesystem Scan</option>
            <option value="recall_facts">Recall Facts</option>
          </select>
        </Field>
        <Field label="Dashboard 标题"><input className={INPUT_CLASS} value={labels.dashboardTitle} onChange={(event) => onChange({ presentation: { ...presentation, labels: { ...labels, dashboardTitle: event.target.value } } })} /></Field>
        <Field label="产物阶段"><input className={INPUT_CLASS} value={presentation.artifactStageOrder.join(', ')} onChange={(event) => onChange({ presentation: { ...presentation, artifactStageOrder: parseCsv(event.target.value) } })} /></Field>
        <Field label="成熟度阶段"><input className={INPUT_CLASS} value={presentation.maturityStages.join(', ')} onChange={(event) => onChange({ presentation: { ...presentation, maturityStages: parseCsv(event.target.value) } })} /></Field>
        <Field label="隐藏指标"><textarea className={TEXTAREA_CLASS} value={presentation.hiddenMetrics.join('\n')} onChange={(event) => onChange({ presentation: { ...presentation, hiddenMetrics: parseLines(event.target.value) } })} /></Field>
      </div>
    </Section>
  );
}

interface EditorProps {
  config: WorkflowProfileConfig;
  onChange: (patch: Partial<WorkflowProfileConfig>) => void;
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[6px] border border-[var(--color-border)] bg-[#0d0d0d]">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[var(--color-border)] px-3">
        <h2 className="text-[13px] font-semibold text-[#f5f5f5]">{title}</h2>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
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

function RuleBox({ title, onDelete, children }: { title: string; onDelete: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-[6px] border border-[var(--color-border)] bg-[#141414] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="truncate text-[12px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>{title}</div>
        <button className="grid h-7 w-7 place-items-center rounded-[4px] text-[var(--color-muted)] hover:text-[var(--color-bad-text)]" type="button" onClick={onDelete} title="删除">
          <Trash2 size={14} />
        </button>
      </div>
      {children}
    </div>
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
        <div key={issue} className="rounded-[4px] border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] px-2 py-1 text-[12px] text-[var(--color-bad-text)]">
          {issue}
        </div>
      ))}
    </div>
  );
}

function emptyProfileConfig(): WorkflowProfileConfig {
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
      errors: false,
      evaluation: false,
      alerts: false,
    },
    sourceRules: [],
    deliveryUnitRules: [],
    artifactRules: [],
    capabilityRules: [],
    attributionPolicy: {
      anchorCategories: ['process_doc'],
      anchorActions: ['read', 'write', 'edit', 'update'],
      sameInteraction: { enabled: true, preferActions: ['write', 'edit', 'update', 'read'] },
      sameSessionWindow: { enabled: true, minutes: 120, requireSameUser: true, preferActions: ['write', 'edit', 'update', 'read'] },
    },
    presentation: {
      workflowKind: 'local_path_monorepo',
      maturityStages: [],
      artifactStageOrder: ['process_doc'],
      hiddenMetrics: ['callQuality', 'matchHealth', 'maturity'],
      knowledgeCoverageMode: 'recall_facts',
    },
  };
}

function newSourceRule(index: number): SourceRule {
  return {
    locatorType: 'path',
    ruleId: `source-${index + 1}`,
    priority: 100 - index,
    confidence: 'high',
    enabled: true,
    category: 'process_doc',
    actions: ['read', 'write', 'edit', 'update'],
    pathContains: [],
  };
}

function newCapabilityRule(index: number): CapabilityRule {
  return {
    ruleId: `capability-${index + 1}`,
    actions: ['read'],
    capabilityCode: `capability-${index + 1}`,
    displayName: `Capability ${index + 1}`,
    sourceCategories: ['process_doc'],
  };
}

function newDeliveryUnitRule(index: number): DeliveryUnitRule {
  return {
    ruleId: `delivery-unit-${index + 1}`,
    sourceRuleIds: [],
    locatorStrategy: { kind: 'parent_dir', stripExtensions: true },
    titleStrategy: 'unit_slug',
  };
}

function newArtifactRule(index: number): ArtifactRule {
  return {
    ruleId: `artifact-${index + 1}`,
    sourceRuleIds: [],
    typePatterns: [],
    defaultArtifactType: 'process_doc',
  };
}

function defaultLocatorStrategy(kind: DeliveryUnitRule['locatorStrategy']['kind']): DeliveryUnitRule['locatorStrategy'] {
  if (kind === 'path_segment') return { kind, stripExtensions: true, unitSegment: 0 };
  if (kind === 'parent_dir') return { kind, stripExtensions: true };
  return { kind };
}

function parseCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseLines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function parseActions(value: string): SourceAction[] {
  return parseCsv(value) as SourceAction[];
}

function formatTypePatterns(patterns: ArtifactRule['typePatterns']): string {
  return patterns.map((item) => `${item.artifactType}=${item.include.join(',')}`).join('\n');
}

function parseTypePatterns(value: string): ArtifactRule['typePatterns'] {
  return parseLines(value).map((line) => {
    const [artifactType, rest = ''] = line.split('=');
    return { artifactType: slugValue(artifactType ?? 'artifact'), include: parseCsv(rest) };
  }).filter((item) => item.artifactType);
}

function slugValue(value: string): string {
  return value.trim().replace(/\s+/g, '-');
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function modeText(mode: WorkflowProfileConfig['projectionMode']): string {
  return mode === 'sdd_bridge' ? 'SDD Bridge' : 'Source Backed';
}

function versionText(item: ProfileConfigAdminSummary): string {
  if (!item.publishedVersionNo && item.source === 'builtin') return 'builtin';
  const published = item.publishedVersionNo ? `发布 v${item.publishedVersionNo}` : '未发布';
  const serving = item.servingVersionNo ? `服务 v${item.servingVersionNo}` : '未服务';
  return published === serving.replace('服务', '发布') ? published : `${published} / ${serving}`;
}

function manifestLabel(key: keyof WorkflowProfileConfig['manifest']): string {
  const labels: Record<keyof WorkflowProfileConfig['manifest'], string> = {
    capabilityUsage: '能力调用',
    deliveryUnits: '交付单元',
    artifacts: '产物',
    artifactTimeline: '产物时间线',
    knowledgeRecalls: '知识召回',
    codeChanges: '代码变更',
    errors: '错误',
    evaluation: '评估',
    alerts: '告警',
  };
  return labels[key];
}
