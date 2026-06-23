import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { BUTTON_CLASS, Field, INPUT_CLASS, PRIMARY_BUTTON_CLASS, Warn } from './eval-ui';
import { useImportFromLogs } from './useEvalItems';

export function EvalImportDialog({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const isSdd = profileId === 'sdd-default';
  const [capabilityCode, setCapabilityCode] = useState(isSdd ? 'design' : '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const importMut = useImportFromLogs(profileId);
  const result = importMut.data;

  function submit() {
    importMut.mutate({
      ...(capabilityCode.trim() ? { capabilityCode: capabilityCode.trim() } : {}),
      ...(from && to ? { from: new Date(from).toISOString(), to: new Date(to).toISOString() } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" role="dialog" aria-label="从日志导入">
      <div className="w-[480px] max-w-[92vw] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-[#f5f5f5]"><Upload size={16} /> 从真实日志导入</h2>
          <button className={BUTTON_CLASS} type="button" aria-label="关闭" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="mt-3 grid gap-3">
          <Warn>导入的 prompt 会作为评测集长期保留（不随观测保留策略清理），且仅 super_admin 可见。请确认无敏感信息。</Warn>
          <Field label="Profile">
            <input className={`${INPUT_CLASS} opacity-70`} value={profileId} readOnly />
          </Field>
          <Field label="能力代码（可选，留空导入全部）">
            <input className={INPUT_CLASS} value={capabilityCode} onChange={(e) => setCapabilityCode(e.target.value)} placeholder="design / proposal / task" />
          </Field>
          <Field label="时间范围（可选，默认全部仍可用正文）">
            <div className="grid grid-cols-2 gap-2">
              <input type="datetime-local" className={INPUT_CLASS} value={from} onChange={(e) => setFrom(e.target.value)} />
              <input type="datetime-local" className={INPUT_CLASS} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </Field>
          {result ? (
            <div className="grid grid-cols-2 gap-1 rounded-[4px] border border-[var(--color-border)] bg-[#0d0d0d] p-2 text-[11px] text-[var(--color-muted)]">
              <span>扫描 {result.scannedCount}</span>
              <span>候选 {result.candidateCount}</span>
              <span>新增 {result.insertedCount}</span>
              <span>刷新 {result.refreshedCount}</span>
              <span>升级 {result.upgradedCount}</span>
              <span>空正文跳过 {result.skippedNoPromptCount}</span>
              <span>超长跳过 {result.skippedOversizeCount}</span>
              <span>无产物类型跳过 {result.skippedNoArtifactTypeCount}</span>
              <span>已删除跳过 {result.skippedDeletedCount}</span>
            </div>
          ) : null}
          {importMut.error ? <p className="text-[12px] text-[var(--color-bad-text)]">{(importMut.error as Error).message}</p> : null}
          <div className="flex justify-end gap-2">
            <button className={BUTTON_CLASS} type="button" onClick={onClose}>关闭</button>
            <button className={PRIMARY_BUTTON_CLASS} type="button" disabled={importMut.isPending} onClick={submit}>导入</button>
          </div>
        </div>
      </div>
    </div>
  );
}
