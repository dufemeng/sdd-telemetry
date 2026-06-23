import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Upload, X } from 'lucide-react';
import { useShellContext } from '@/components/layout/useShellContext';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BUTTON_CLASS, Field, INPUT_CLASS, MONO_TEXTAREA_CLASS, PRIMARY_BUTTON_CLASS } from './eval-ui';
import { useCreateEvalItem, useEvalItemsList } from './useEvalItems';
import { EvalItemEditor } from './EvalItemEditor';
import { EvalImportDialog } from './EvalImportDialog';

const PAGE_SIZE = 20;
const ARTIFACT_TYPES = ['design', 'proposal', 'tasks'] as const;

interface ManualDraft {
  promptText: string;
  targetSkill: string;
  targetArtifactType: typeof ARTIFACT_TYPES[number];
  title: string;
  notes: string;
}

export default function EvalItemsPage() {
  const { profileId } = useShellContext();
  const [filters, setFilters] = useState<{ source?: string; capabilityCode?: string; enabled?: boolean; keyword?: string; page: number }>({
    page: 1,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualDraft | null>(null);

  // R6: 切换 profile 重置筛选和选中
  useEffect(() => {
    setFilters({ page: 1 });
    setSelectedId(null);
    setManualDraft(null);
  }, [profileId]);

  const listQuery = useEvalItemsList({ profileId, ...filters, pageSize: PAGE_SIZE });

  const summary = listQuery.data?.summary;
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function openCreateFromCopy(seed: { promptText: string; targetSkill: string | null; targetArtifactType: string | null }) {
    const art = (ARTIFACT_TYPES as readonly string[]).includes(seed.targetArtifactType ?? '')
      ? (seed.targetArtifactType as typeof ARTIFACT_TYPES[number])
      : 'design';
    setManualDraft({
      promptText: seed.promptText,
      targetSkill: seed.targetSkill ?? '',
      targetArtifactType: art,
      title: '',
      notes: '',
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="评测集"
        icon={<ClipboardList size={18} />}
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <button className={BUTTON_CLASS} type="button" onClick={() => setManualDraft({ promptText: '', targetSkill: '', targetArtifactType: 'design', title: '', notes: '' })}>
              <Plus size={14} /> 手工新增
            </button>
            <button className={PRIMARY_BUTTON_CLASS} type="button" onClick={() => setImportOpen(true)}>
              <Upload size={14} /> 从日志导入
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-[var(--color-secondary)]">
          <span>总数 {summary?.total ?? 0}</span>
          <span>启用 {summary?.enabled ?? 0}</span>
          <span>日志清洗 {summary?.cleaned ?? 0}</span>
          <span>手工 {summary?.manual ?? 0}</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <select
              className={`${INPUT_CLASS} max-w-[120px]`}
              value={filters.source ?? ''}
              onChange={(e) => { setFilters((f) => ({ ...f, source: e.target.value || undefined, page: 1 })); }}
            >
              <option value="">全部来源</option>
              <option value="cleaned">日志清洗</option>
              <option value="manual">手工</option>
            </select>
            <select
              className={`${INPUT_CLASS} max-w-[120px]`}
              value={filters.enabled === undefined ? '' : filters.enabled ? 'true' : 'false'}
              onChange={(e) => { const v = e.target.value; setFilters((f) => ({ ...f, enabled: v === '' ? undefined : v === 'true', page: 1 })); }}
            >
              <option value="">全部状态</option>
              <option value="true">已启用</option>
              <option value="false">已停用</option>
            </select>
            <input
              className={`${INPUT_CLASS} max-w-[160px]`}
              placeholder="搜索标题/备注/技能"
              value={filters.keyword ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value || undefined, page: 1 }))}
            />
          </span>
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-[440px_minmax(0,1fr)]">
        <Panel title="样本列表">
          <DataTable
            headers={['摘要', '来源', '目标', '观测', '状态']}
            rows={items.map((item) => ({
              key: item.id,
              cells: [
                <div key={`${item.id}-p`} className="truncate text-[12px]" title={item.title ?? item.promptPreview}>
                  {item.title ?? item.promptPreview}
                </div>,
                <span key={`${item.id}-s`} className="text-[11px] text-[var(--color-muted)]">{item.source === 'cleaned' ? '日志' : '手工'}</span>,
                <span key={`${item.id}-t`} className="text-[11px] font-mono text-[var(--color-secondary)]">{item.targetSkill ?? '—'}</span>,
                <span key={`${item.id}-c`} className="text-[11px]">{item.occurrenceCount}</span>,
                <StatusBadge key={`${item.id}-e`} status={item.enabled ? '启用' : '停用'} variant={item.enabled ? 'good' : 'neutral'} />,
              ],
            }))}
            selectedRowKey={selectedId ?? undefined}
            onRowSelect={(key) => setSelectedId(String(key))}
            emptyText={listQuery.isPending ? '加载中…' : total === 0 ? '暂无样本，点击右上角"从日志导入"或"手工新增"' : '无匹配样本'}
          />
          {listQuery.error ? <p className="mt-2 text-[12px] text-[var(--color-bad-text)]">{(listQuery.error as Error).message}</p> : null}
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>第 {filters.page} / {lastPage} 页 · 共 {total} 条</span>
            <div className="flex gap-2">
              <button className="text-[var(--color-secondary)] hover:text-[var(--color-primary)] disabled:opacity-40"
                disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>上一页</button>
              <button className="text-[var(--color-secondary)] hover:text-[var(--color-primary)] disabled:opacity-40"
                disabled={filters.page >= lastPage} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>下一页</button>
            </div>
          </div>
        </Panel>

        <EvalItemEditor profileId={profileId} selectedId={selectedId} onCopyAsManual={openCreateFromCopy} />
      </div>

      {importOpen ? <EvalImportDialog profileId={profileId} onClose={() => setImportOpen(false)} /> : null}
      {manualDraft ? (
        <ManualCreateDialog
          profileId={profileId}
          draft={manualDraft}
          onCancel={() => setManualDraft(null)}
          onDone={() => setManualDraft(null)}
        />
      ) : null}
    </div>
  );
}

function ManualCreateDialog({ profileId, draft, onCancel, onDone }: {
  profileId: string;
  draft: ManualDraft;
  onCancel: () => void;
  onDone: () => void;
}) {
  const create = useCreateEvalItem(profileId);
  const [form, setForm] = useState<ManualDraft>(draft);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    create.mutate(
      {
        source: 'manual',
        promptText: form.promptText,
        targetSkill: form.targetSkill.trim(),
        targetArtifactType: form.targetArtifactType,
        ...(form.title.trim() ? { title: form.title.trim() } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      },
      {
        onSuccess: () => onDone(),
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" role="dialog" aria-label="手工新增样本">
      <div className="w-[560px] max-w-[92vw] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#f5f5f5]">手工新增样本</h2>
          <button className={BUTTON_CLASS} type="button" aria-label="关闭" onClick={onCancel}><X size={14} /></button>
        </div>
        <div className="mt-3 grid gap-3">
          <Field label="Profile">
            <input className={`${INPUT_CLASS} opacity-70`} value={profileId} readOnly />
          </Field>
          <Field label="Prompt（必填）">
            <textarea className={MONO_TEXTAREA_CLASS} rows={6} value={form.promptText} onChange={(e) => setForm((f) => ({ ...f, promptText: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="目标技能（必填）">
              <input className={INPUT_CLASS} value={form.targetSkill} onChange={(e) => setForm((f) => ({ ...f, targetSkill: e.target.value }))} placeholder="bk-fe-design" />
            </Field>
            <Field label="产物类型（必填）">
              <select className={INPUT_CLASS} value={form.targetArtifactType} onChange={(e) => setForm((f) => ({ ...f, targetArtifactType: e.target.value as typeof ARTIFACT_TYPES[number] }))}>
                {ARTIFACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <Field label="标题（可选）">
            <input className={INPUT_CLASS} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
          <Field label="备注（可选）">
            <textarea className={MONO_TEXTAREA_CLASS} rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          {error ? <p className="text-[12px] text-[var(--color-bad-text)]">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button className={BUTTON_CLASS} type="button" onClick={onCancel}>取消</button>
            <button className={PRIMARY_BUTTON_CLASS} type="button" disabled={create.isPending || !form.promptText.trim() || !form.targetSkill.trim()} onClick={submit}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}
