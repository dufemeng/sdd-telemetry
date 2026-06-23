import { useEffect, useMemo, useState } from 'react';
import { CopyPlus, Save, Trash2 } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/EmptyState';
import { BUTTON_CLASS, ConfigGroup, Field, INPUT_CLASS, MONO_TEXTAREA_CLASS, PRIMARY_BUTTON_CLASS, Warn } from './eval-ui';
import { useDeleteEvalItem, useEvalItemDetail, useUpdateEvalItem } from './useEvalItems';

interface EditorProps {
  profileId: string;
  selectedId: string | null;
  /** 触发"复制为手工样本": 预填当前 cleaned 的 prompt/target 到新建表单。 */
  onCopyAsManual?: (source: { promptText: string; targetSkill: string | null; targetArtifactType: string | null }) => void;
}

export function EvalItemEditor({ profileId, selectedId, onCopyAsManual }: EditorProps) {
  const detailQuery = useEvalItemDetail(profileId, selectedId);
  const update = useUpdateEvalItem(profileId);
  const remove = useDeleteEvalItem(profileId);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 切换选中项或 profile 时重置本地编辑状态
  useEffect(() => {
    if (detailQuery.data) {
      setTitle(detailQuery.data.title ?? '');
      setNotes(detailQuery.data.notes ?? '');
      setEnabled(detailQuery.data.enabled);
      setConfirmDelete(false);
    }
  }, [detailQuery.data?.id]);

  const dirty = useMemo(() => {
    const d = detailQuery.data;
    if (!d) return false;
    return (d.title ?? '') !== title || (d.notes ?? '') !== notes || d.enabled !== enabled;
  }, [detailQuery.data, title, notes, enabled]);

  if (!selectedId) {
    return <Panel title="样本详情"><EmptyState text="请选择左侧样本查看详情" /></Panel>;
  }
  if (detailQuery.isLoading) {
    return <Panel title="样本详情"><div className="p-4 text-[12px] text-[var(--color-muted)]">加载中…</div></Panel>;
  }
  if (detailQuery.error || !detailQuery.data) {
    return <Panel title="样本详情"><EmptyState text="样本不存在或已删除" /></Panel>;
  }
  const item = detailQuery.data;
  const isCleaned = item.source === 'cleaned';

  function submit() {
    update.mutate({ id: item.id, body: { title: title || null, notes: notes || null, enabled } });
  }

  return (
    <Panel title="样本详情">
      <div className="grid gap-3">
        {isCleaned ? (
          <Warn>这是日志清洗样本，prompt / 目标技能 / 产物类型只读。如需改写请"复制为手工样本"。</Warn>
        ) : null}
        <ConfigGroup title="来源">
          <div className="grid gap-1 text-[12px] text-[var(--color-secondary)]">
            <span>来源：{item.source === 'cleaned' ? '日志清洗' : '手工'}</span>
            <span>能力代码：<code className="font-mono">{item.originCapabilityCode ?? '—'}</code></span>
            <span>原始名：<code className="font-mono">{item.originRawCapabilityName ?? '—'}</code></span>
            <span>目标技能：<code className="font-mono">{item.targetSkill ?? '—'}</code></span>
            <span>产物类型：<code className="font-mono">{item.targetArtifactType ?? '—'}</code></span>
            {item.originInteractionId ? <span>来源交互：<code className="font-mono">{item.originInteractionId}</code></span> : null}
            <span>观测次数：{item.occurrenceCount}</span>
          </div>
        </ConfigGroup>

        <ConfigGroup title="Prompt（纯文本展示）">
          <textarea
            className={MONO_TEXTAREA_CLASS}
            value={item.promptText}
            readOnly
            rows={8}
            aria-label="prompt 正文"
          />
        </ConfigGroup>

        <ConfigGroup title="元数据">
          <Field label="标题">
            <input className={INPUT_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="备注">
            <textarea className={MONO_TEXTAREA_CLASS} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-secondary)]">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            纳入评测
          </label>
        </ConfigGroup>

        <div className="flex flex-wrap items-center gap-2">
          <button className={PRIMARY_BUTTON_CLASS} type="button" disabled={!dirty || update.isPending} onClick={submit}>
            <Save size={14} /> 保存
          </button>
          {isCleaned && onCopyAsManual ? (
            <button
              className={BUTTON_CLASS}
              type="button"
              onClick={() => onCopyAsManual({ promptText: item.promptText, targetSkill: item.targetSkill, targetArtifactType: item.targetArtifactType })}
            >
              <CopyPlus size={14} /> 复制为手工样本
            </button>
          ) : null}
          {!confirmDelete ? (
            <button className={BUTTON_CLASS} type="button" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} /> 删除
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <Warn>删除会清空正文且同 key 不再从日志导入，不可撤销。</Warn>
              <div className="flex items-center gap-2">
                <button className={PRIMARY_BUTTON_CLASS} type="button" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>确认删除</button>
                <button className={BUTTON_CLASS} type="button" onClick={() => setConfirmDelete(false)}>取消</button>
              </div>
            </div>
          )}
        </div>
        {update.error ? <p className="text-[12px] text-[var(--color-bad-text)]">{(update.error as Error).message}</p> : null}
        {remove.error ? <p className="text-[12px] text-[var(--color-bad-text)]">{(remove.error as Error).message}</p> : null}
      </div>
    </Panel>
  );
}
