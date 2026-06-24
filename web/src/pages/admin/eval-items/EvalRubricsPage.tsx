import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Plus, Rocket, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { EvalArtifactType, Rubric, RubricDimension } from '@sdd-telemetry/api';
import { ApiRequestError } from '@/api/client';
import { useShellContext } from '@/components/layout/useShellContext';
import { DataTable } from '@/components/ui/DataTable';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BUTTON_CLASS, Field, INPUT_CLASS, MONO_TEXTAREA_CLASS, PRIMARY_BUTTON_CLASS } from './eval-ui';
import { usePublishRubric, useRubricOverview, useSaveRubricDraft } from './useEvalRubrics';

const ARTIFACT_TYPES: Array<{ value: EvalArtifactType; label: string }> = [
  { value: 'design', label: '设计（design）' },
  { value: 'proposal', label: '提案（proposal）' },
  { value: 'tasks', label: '任务（tasks）' },
];

interface WorkingCopy {
  key: string;
  rubric: Rubric;
  savedSnapshot: string;
}

export default function EvalRubricsPage() {
  const { profileId } = useShellContext();
  const [artifactType, setArtifactType] = useState<EvalArtifactType>('design');
  const [workingCopy, setWorkingCopy] = useState<WorkingCopy | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const overviewQuery = useRubricOverview(profileId, artifactType);
  const saveDraft = useSaveRubricDraft(profileId, artifactType);
  const publish = usePublishRubric(profileId, artifactType);
  const currentKey = `${profileId}:${artifactType}`;

  useEffect(() => {
    setArtifactType('design');
    setWorkingCopy(null);
    setFeedback(null);
  }, [profileId]);

  useEffect(() => {
    const overview = overviewQuery.data;
    if (!overview) return;
    setWorkingCopy((current) => {
      if (current?.key === currentKey) return current;
      const initialRubric = cloneRubric(overview.draft?.rubric ?? overview.active?.rubric ?? overview.builtinDefault);
      return { key: currentKey, rubric: initialRubric, savedSnapshot: rubricSnapshot(initialRubric) };
    });
  }, [currentKey, overviewQuery.data]);

  const working = workingCopy?.key === currentKey ? workingCopy.rubric : null;
  const isDirty = workingCopy?.key === currentKey
    ? rubricSnapshot(workingCopy.rubric) !== workingCopy.savedSnapshot
    : false;
  const maxScore = useMemo(
    () => working?.dimensions.reduce((sum, dimension) => sum + dimension.weight * 2, 0) ?? 0,
    [working],
  );
  const pending = saveDraft.isPending || publish.isPending;
  const queryError = overviewQuery.error;
  const profileNotEnabled = queryError instanceof ApiRequestError && queryError.code === 'EVAL_PROFILE_NOT_ENABLED';
  const overview = overviewQuery.data;
  const hasPersistedVersion = Boolean(overview?.active || overview?.draft);
  const canSave = Boolean(working && (isDirty || !hasPersistedVersion));
  const canPublish = Boolean(working && (isDirty || overview?.draft || !overview?.active));

  function changeArtifactType(next: EvalArtifactType) {
    setArtifactType(next);
    setFeedback(null);
  }

  function updateWorking(updater: (current: Rubric) => Rubric) {
    setWorkingCopy((current) => current?.key === currentKey
      ? { ...current, rubric: updater(current.rubric) }
      : current);
    setFeedback(null);
  }

  function updateJudge(next: Partial<Rubric['judge']>) {
    updateWorking((current) => ({ ...current, judge: { ...current.judge, ...next } }));
  }

  function updateDimension(index: number, updater: (current: RubricDimension) => RubricDimension) {
    updateWorking((current) => ({
      ...current,
      dimensions: current.dimensions.map((dimension, currentIndex) => (
        currentIndex === index ? updater(dimension) : dimension
      )),
    }));
  }

  function addDimension() {
    if (!working) return;
    const code = nextDimensionCode(artifactType, working.dimensions);
    updateWorking((current) => ({
      ...current,
      dimensions: [
        ...current.dimensions,
        {
          code,
          name: '新维度',
          weight: 1,
          anchors: { '0': '未达到要求', '1': '部分达到要求', '2': '完整达到要求' },
        },
      ],
    }));
  }

  function removeDimension(index: number) {
    updateWorking((current) => ({
      ...current,
      dimensions: current.dimensions.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  function restoreBuiltin() {
    const builtin = overviewQuery.data?.builtinDefault;
    if (!builtin) return;
    updateWorking(() => cloneRubric(builtin));
    setFeedback({ kind: 'success', message: '已恢复为内置默认，保存后生效。' });
  }

  function markSaved(sourceSnapshot: string, payload: Rubric) {
    const savedSnapshot = rubricSnapshot(payload);
    setWorkingCopy((current) => {
      if (current?.key !== currentKey) return current;
      return rubricSnapshot(current.rubric) === sourceSnapshot
        ? { ...current, rubric: payload, savedSnapshot }
        : { ...current, savedSnapshot };
    });
  }

  async function save() {
    if (!working || !canSave) return;
    const validationError = validateRubric(working);
    if (validationError) {
      setFeedback({ kind: 'error', message: validationError });
      return;
    }
    const sourceSnapshot = rubricSnapshot(working);
    const payload = normalizeRubric(working);
    try {
      const result = await saveDraft.mutateAsync(payload);
      markSaved(sourceSnapshot, payload);
      setFeedback({ kind: 'success', message: `草稿 v${result.versionNo} 已保存。` });
    } catch (error) {
      setFeedback({ kind: 'error', message: errorMessage(error) });
    }
  }

  async function saveAndPublish() {
    if (!working || !canPublish) return;
    const validationError = validateRubric(working);
    if (validationError) {
      setFeedback({ kind: 'error', message: validationError });
      return;
    }
    try {
      const existingDraftId = !isDirty ? overview?.draft?.id : undefined;
      if (existingDraftId) {
        const result = await publish.mutateAsync(existingDraftId);
        setFeedback({ kind: 'success', message: `评分标准 v${result.versionNo} 已发布。` });
        return;
      }
      const sourceSnapshot = rubricSnapshot(working);
      const payload = normalizeRubric(working);
      const draft = await saveDraft.mutateAsync(payload);
      const result = await publish.mutateAsync(draft.id);
      markSaved(sourceSnapshot, payload);
      setFeedback({ kind: 'success', message: `评分标准 v${result.versionNo} 已发布。` });
    } catch (error) {
      setFeedback({ kind: 'error', message: errorMessage(error) });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="评分标准"
        icon={<ListChecks size={18} />}
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <button className={BUTTON_CLASS} type="button" disabled={!working || pending} onClick={restoreBuiltin}>
              <RotateCcw size={14} /> 恢复内置默认
            </button>
            <button className={BUTTON_CLASS} type="button" disabled={!canSave || pending} onClick={() => void save()}>
              <Save size={14} /> 保存草稿
            </button>
            <button className={PRIMARY_BUTTON_CLASS} type="button" disabled={!canPublish || pending} onClick={() => void saveAndPublish()}>
              <Rocket size={14} /> 发布
            </button>
          </div>
        }
      >
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Field label="产物类型">
            <select className={INPUT_CLASS} value={artifactType} onChange={(event) => changeArtifactType(event.target.value as EvalArtifactType)}>
              {ARTIFACT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2 text-[12px] text-[var(--color-secondary)]">
            <span>Profile <strong className="font-mono font-medium text-[#f5f5f5]">{profileId}</strong></span>
            <span>
              活动版本 <strong className="font-mono font-medium text-[#f5f5f5]">{overview?.active ? `v${overview.active.versionNo}` : '—'}</strong>
              {overview?.active?.publishedAt ? ` · ${formatDate(overview.active.publishedAt)}` : ''}
            </span>
            <StatusBadge status={overview?.draft ? `草稿 v${overview.draft.versionNo}` : '无草稿'} variant={overview?.draft ? 'warn' : 'neutral'} />
            <StatusBadge status={isDirty ? '未保存修改' : '已同步'} variant={isDirty ? 'warn' : 'neutral'} />
          </div>
        </div>
        {overviewQuery.isPending ? <p className="mt-3 text-[12px] text-[var(--color-muted)]">正在加载评分标准…</p> : null}
        {profileNotEnabled ? (
          <p className="mt-3 rounded-[4px] border border-[rgba(245,158,11,0.35)] bg-[var(--color-warn-bg)] px-3 py-2 text-[12px] text-[var(--color-warn-text)]">
            当前 profile 未开启 evaluation。请前往「工作流管理」开启 evaluation 并重新发布配置。
          </p>
        ) : queryError ? (
          <p className="mt-3 text-[12px] text-[var(--color-bad-text)]">加载失败：{errorMessage(queryError)}</p>
        ) : null}
        {overview && overview.versions.length === 0 ? (
          <p className="mt-3 text-[12px] text-[var(--color-muted)]">尚无已保存版本，当前为内置默认。</p>
        ) : null}
        {feedback ? (
          <p className={`mt-3 text-[12px] ${feedback.kind === 'error' ? 'text-[var(--color-bad-text)]' : 'text-[var(--color-good-text)]'}`}>
            {feedback.message}
          </p>
        ) : null}
      </Panel>

      {working ? (
        <Panel
          title="结构化编辑器"
          headerRight={<span className="text-[12px] text-[var(--color-secondary)]">满分 Σ(weight×2) = <strong className="font-mono text-[var(--color-primary)]">{formatScore(maxScore)}</strong></span>}
        >
          <div className="grid gap-3 border-b border-[var(--color-border)] pb-3 md:grid-cols-3">
            <Field label="Judge temperature" hint="0–1">
              <input
                className={INPUT_CLASS}
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={working.judge.temperature}
                onChange={(event) => updateJudge({ temperature: Number(event.target.value) })}
              />
            </Field>
            <Field label="Judge context" hint="v1 仅支持 intrinsic">
              <select className={INPUT_CLASS} value={working.judge.context} onChange={(event) => updateJudge({ context: event.target.value as Rubric['judge']['context'] })}>
                <option value="intrinsic">intrinsic</option>
                <option value="with_code" disabled>with_code（后续版本）</option>
              </select>
            </Field>
            <label className="flex min-h-8 items-end gap-2 pb-1 text-[12px] text-[var(--color-secondary)]">
              <input
                type="checkbox"
                checked={working.judge.evidenceRequired}
                onChange={(event) => updateJudge({ evidenceRequired: event.target.checked })}
              />
              必须提供评分证据
            </label>
          </div>

          <div className="mt-3 overflow-x-auto rounded-[4px] border border-[var(--color-border)]">
            <table className="w-full min-w-[1060px] border-collapse">
              <thead className="bg-[#171717] text-left text-[10px] uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-2 py-2">Code</th>
                  <th className="px-2 py-2">名称</th>
                  <th className="px-2 py-2">权重</th>
                  <th className="px-2 py-2">锚点 0</th>
                  <th className="px-2 py-2">锚点 1</th>
                  <th className="px-2 py-2">锚点 2</th>
                  <th className="w-12 px-2 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {working.dimensions.map((dimension, index) => (
                  <tr key={`${index}-${dimension.code}`} className="border-t border-[var(--color-border)] align-top">
                    <td className="w-24 p-2">
                      <input className={`${INPUT_CLASS} font-mono`} value={dimension.code} onChange={(event) => updateDimension(index, (current) => ({ ...current, code: event.target.value }))} />
                    </td>
                    <td className="w-36 p-2">
                      <input className={INPUT_CLASS} value={dimension.name} onChange={(event) => updateDimension(index, (current) => ({ ...current, name: event.target.value }))} />
                    </td>
                    <td className="w-24 p-2">
                      <input className={INPUT_CLASS} type="number" min={0.01} max={100} step={0.25} value={dimension.weight} onChange={(event) => updateDimension(index, (current) => ({ ...current, weight: Number(event.target.value) }))} />
                    </td>
                    {(['0', '1', '2'] as const).map((anchor) => (
                      <td key={anchor} className="min-w-52 p-2">
                        <textarea
                          aria-label={`${dimension.code || `维度 ${index + 1}`} 锚点 ${anchor}`}
                          className={`${MONO_TEXTAREA_CLASS} min-h-[88px]`}
                          value={dimension.anchors[anchor]}
                          onChange={(event) => updateDimension(index, (current) => ({
                            ...current,
                            anchors: { ...current.anchors, [anchor]: event.target.value },
                          }))}
                        />
                      </td>
                    ))}
                    <td className="p-2">
                      <button
                        className={`${BUTTON_CLASS} px-2`}
                        type="button"
                        aria-label={`删除维度 ${dimension.code || index + 1}`}
                        disabled={working.dimensions.length <= 1}
                        onClick={() => removeDimension(index)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={`${BUTTON_CLASS} mt-3`} type="button" onClick={addDimension}>
            <Plus size={14} /> 添加维度
          </button>
        </Panel>
      ) : null}

      <Panel title="版本历史">
        <DataTable
          headers={['版本', '状态', '定义 Hash', '发布时间']}
          rows={(overview?.versions ?? []).map((version) => ({
            key: version.id,
            cells: [
              <span key={`${version.id}-v`} className="font-mono">v{version.versionNo}</span>,
              <StatusBadge key={`${version.id}-s`} status={version.versionStatus === 'published' ? '已发布' : '草稿'} variant={version.versionStatus === 'published' ? 'good' : 'warn'} />,
              <span key={`${version.id}-h`} className="font-mono" title={version.definitionHash}>{version.definitionHash.slice(0, 8)}</span>,
              <span key={`${version.id}-p`}>{version.publishedAt ? formatDate(version.publishedAt) : '—'}</span>,
            ],
          }))}
          emptyText={overviewQuery.isPending ? '加载中…' : queryError ? '版本历史加载失败' : '暂无版本历史'}
        />
      </Panel>
    </div>
  );
}

function cloneRubric(rubric: Rubric): Rubric {
  return {
    judge: { ...rubric.judge },
    dimensions: rubric.dimensions.map((dimension) => ({
      ...dimension,
      anchors: { ...dimension.anchors },
    })),
  };
}

function normalizeRubric(rubric: Rubric): Rubric {
  const normalized = cloneRubric(rubric);
  return {
    ...normalized,
    dimensions: normalized.dimensions.map((dimension) => ({
      ...dimension,
      code: dimension.code.trim(),
    })),
  };
}

function rubricSnapshot(rubric: Rubric): string {
  return JSON.stringify(rubric);
}

function nextDimensionCode(artifactType: EvalArtifactType, dimensions: RubricDimension[]): string {
  const prefix = artifactType === 'design' ? 'D' : artifactType === 'proposal' ? 'P' : 'T';
  const used = new Set(dimensions.map((dimension) => dimension.code));
  let suffix = dimensions.length + 1;
  while (used.has(`${prefix}${suffix}`)) suffix += 1;
  return `${prefix}${suffix}`;
}

function validateRubric(rubric: Rubric): string | null {
  if (rubric.judge.temperature < 0 || rubric.judge.temperature > 1 || !Number.isFinite(rubric.judge.temperature)) {
    return 'temperature 必须是 0–1 之间的数字。';
  }
  if (rubric.dimensions.length === 0) return '至少需要一个评分维度。';
  const seen = new Set<string>();
  for (const [index, dimension] of rubric.dimensions.entries()) {
    const row = `第 ${index + 1} 行`;
    const code = dimension.code.trim();
    if (!code) return `${row}的 code 不能为空。`;
    if (seen.has(code)) return `维度 code「${code}」重复。`;
    seen.add(code);
    if (!dimension.name.trim()) return `${row}的名称不能为空。`;
    if (!Number.isFinite(dimension.weight) || dimension.weight <= 0) return `${row}的 weight 必须大于 0。`;
    if (!dimension.anchors['0'].trim() || !dimension.anchors['1'].trim() || !dimension.anchors['2'].trim()) {
      return `${row}的三个锚点都不能为空。`;
    }
  }
  return null;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
