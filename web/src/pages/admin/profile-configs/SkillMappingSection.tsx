import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WorkflowProfileConfig } from '@sdd-telemetry/api';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  type SemanticRow,
  decodeSemanticRows,
  emptySemanticRow,
  encodeSemanticRows,
} from './config-authoring';
import { BUTTON_CLASS, ConfigGroup, Field, INPUT_CLASS, PRIMARY_BUTTON_CLASS, TEXTAREA_CLASS, Warn, linesToArray } from './config-ui';

type EditMode = 'existing' | 'new';

export function SkillMappingSection({
  config,
  onChange,
  readOnly = false,
}: {
  config: WorkflowProfileConfig;
  onChange: (next: WorkflowProfileConfig) => void;
  readOnly?: boolean;
}) {
  const rows = decodeSemanticRows(config);
  const [selectedCode, setSelectedCode] = useState<string | null>(rows[0]?.code ?? null);
  const [mode, setMode] = useState<EditMode>('existing');
  const [draft, setDraft] = useState<SemanticRow | null>(rows[0] ? cloneSemanticRow(rows[0]) : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const selectedRow = mode === 'existing' ? rows.find((row) => row.code === selectedCode) ?? null : null;
  const dirty = Boolean(draft && (mode === 'new' || (selectedRow && semanticSignature(draft) !== semanticSignature(selectedRow))));
  const validationMessage = getSemanticValidationMessage(draft, rows, mode === 'existing' ? selectedCode : null);

  useEffect(() => {
    if (mode === 'new') return;
    const next = rows.find((row) => row.code === selectedCode) ?? rows[0] ?? null;
    setSelectedCode(next?.code ?? null);
    setDraft(next ? cloneSemanticRow(next) : null);
    setNotice(null);
    setConfirmingDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  function selectRow(rowKey: React.Key) {
    if (dirty) {
      setNotice('先保存或取消当前技能修改。');
      return;
    }
    const next = rows.find((row) => row.code === rowKey);
    if (!next) return;
    setMode('existing');
    setSelectedCode(next.code);
    setDraft(cloneSemanticRow(next));
    setNotice(null);
    setConfirmingDelete(false);
  }

  function startCreate() {
    if (dirty) {
      setNotice('先保存或取消当前技能修改。');
      return;
    }
    const code = nextSemanticCode(rows);
    const next = emptySemanticRow();
    next.code = code;
    next.displayName = '新能力';
    next.aliases = [code];
    setMode('new');
    setSelectedCode(null);
    setDraft(next);
    setNotice(null);
    setConfirmingDelete(false);
  }

  function updateDraft(patch: Partial<SemanticRow>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setNotice(null);
    setConfirmingDelete(false);
  }

  function saveDraft() {
    if (!draft || validationMessage) return;
    const next = normalizeSemanticRow(draft);
    const nextRows =
      mode === 'new'
        ? [...rows, next]
        : rows.map((row) => (row.code === selectedCode ? next : row));
    onChange(encodeSemanticRows(config, nextRows));
    setMode('existing');
    setSelectedCode(next.code);
    setDraft(cloneSemanticRow(next));
    setNotice(null);
    setConfirmingDelete(false);
  }

  function cancelDraft() {
    const next = selectedCode ? rows.find((row) => row.code === selectedCode) ?? rows[0] ?? null : rows[0] ?? null;
    setMode('existing');
    setSelectedCode(next?.code ?? null);
    setDraft(next ? cloneSemanticRow(next) : null);
    setNotice(null);
    setConfirmingDelete(false);
  }

  function deleteDraft() {
    if (mode !== 'existing' || !selectedCode) return;
    const nextRows = rows.filter((row) => row.code !== selectedCode);
    onChange(encodeSemanticRows(config, nextRows));
    const next = nextRows[0] ?? null;
    setSelectedCode(next?.code ?? null);
    setDraft(next ? cloneSemanticRow(next) : null);
    setNotice(null);
    setConfirmingDelete(false);
  }

  if (readOnly) {
    return (
      <ConfigGroup title="技能归类" action={<span className="font-mono text-[11px] text-[var(--color-muted)]">{rows.length} 条</span>}>
        <DataTable
          headers={['能力', '显示名', '别名', '产物', '状态']}
          rows={rows.map((row) => ({
            key: row.code,
            cells: [
              <span key={`${row.code}-code`} className="font-mono font-semibold text-[#f5f5f5]">
                {row.code}
              </span>,
              <span key={`${row.code}-name`} className="font-sans text-[var(--color-secondary)]">
                {row.displayName}
              </span>,
              `${row.aliases.length} 个`,
              row.artifactPatterns.length ? `${row.artifactPatterns.length} 个` : '无',
              <StatusBadge
                key={`${row.code}-status`}
                status={row.aliases.length > 0 ? '可匹配' : '缺别名'}
                variant={row.aliases.length > 0 ? 'good' : 'warn'}
              />,
            ],
          }))}
          emptyText="暂无技能语义"
        />
      </ConfigGroup>
    );
  }

  return (
    <ConfigGroup
      title="技能归类"
      action={
        <button className={BUTTON_CLASS} type="button" onClick={startCreate}>
          <Plus size={14} /> 新增技能
        </button>
      }
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <DataTable
          headers={['技能语义', '别名', '产物', '状态']}
          rows={rows.map((row) => ({
            key: row.code,
            cells: [
              <div key={`${row.code}-name`}>
                <div className="font-mono text-[12px] font-semibold text-[#f5f5f5]">{row.code}</div>
                <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">{row.displayName}</div>
              </div>,
              `${row.aliases.length} 个`,
              row.artifactPatterns.length ? `${row.artifactPatterns.length} 个文件名` : '不产出文档',
              <StatusBadge
                key={`${row.code}-status`}
                status={row.aliases.length > 0 ? '可匹配' : '缺别名'}
                variant={row.aliases.length > 0 ? 'good' : 'warn'}
              />,
            ],
          }))}
          selectedRowKey={mode === 'existing' ? selectedCode : null}
          onRowSelect={selectRow}
          emptyText="暂无技能语义"
        />

        <div className="rounded-[6px] border border-[var(--color-border)] bg-[#141414] p-3">
          {draft ? (
            <SkillEditor
              confirmingDelete={confirmingDelete}
              dirty={dirty}
              mode={mode}
              notice={notice}
              row={draft}
              validationMessage={validationMessage}
              onCancel={cancelDraft}
              onChange={updateDraft}
              onConfirmDelete={deleteDraft}
              onSave={saveDraft}
              onToggleDelete={() => setConfirmingDelete((value) => !value)}
            />
          ) : (
            <p className="text-[12px] text-[var(--color-muted)]">点「新增技能」创建第一条技能语义。</p>
          )}
        </div>
      </div>
    </ConfigGroup>
  );
}

function SkillEditor({
  confirmingDelete,
  dirty,
  mode,
  notice,
  row,
  validationMessage,
  onCancel,
  onChange,
  onConfirmDelete,
  onSave,
  onToggleDelete,
}: {
  confirmingDelete: boolean;
  dirty: boolean;
  mode: EditMode;
  notice: string | null;
  row: SemanticRow;
  validationMessage: string | null;
  onCancel: () => void;
  onChange: (patch: Partial<SemanticRow>) => void;
  onConfirmDelete: () => void;
  onSave: () => void;
  onToggleDelete: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <div className="text-[13px] font-semibold text-[#f5f5f5]">{mode === 'new' ? '新增技能' : '编辑技能'}</div>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2">
        <Field label="能力标识" hint="看板归类用，保存后别频繁改">
          <input
            className={`${INPUT_CLASS} font-mono`}
            value={row.code}
            onChange={(event) => onChange({ code: event.target.value.trim().replace(/\s+/g, '-') })}
          />
        </Field>
        <Field label="显示名">
          <input className={INPUT_CLASS} value={row.displayName} onChange={(event) => onChange({ displayName: event.target.value })} />
        </Field>
      </div>

      <Field label="描述" hint="给配置维护者看，选填">
        <input className={INPUT_CLASS} value={row.description} onChange={(event) => onChange({ description: event.target.value })} />
      </Field>

      <Field label="技能别名" hint="匹配这些技能名，一行一个">
        <textarea
          className={`${TEXTAREA_CLASS} font-mono`}
          placeholder={'bk-fe-design\nbk-fe:design'}
          value={row.aliases.join('\n')}
          onChange={(event) => onChange({ aliases: linesToArray(event.target.value) })}
        />
      </Field>

      <Field label="产物文件名" hint="这个能力产出的文档文件名，可用 * 通配，一行一个；选填">
        <textarea
          className={`${TEXTAREA_CLASS} font-mono`}
          placeholder={'design.md\ndesign-*.md'}
          value={row.artifactPatterns.join('\n')}
          onChange={(event) => onChange({ artifactPatterns: linesToArray(event.target.value) })}
        />
      </Field>

      {validationMessage ? <Warn>{validationMessage}</Warn> : null}
      {notice ? <span className="text-[12px] text-[var(--color-warn-text)]">{notice}</span> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button className={PRIMARY_BUTTON_CLASS} disabled={!dirty || Boolean(validationMessage)} type="button" onClick={onSave}>
          保存技能
        </button>
        <button className={BUTTON_CLASS} disabled={!dirty} type="button" onClick={onCancel}>
          取消
        </button>
        {mode === 'existing' ? (
          confirmingDelete ? (
            <>
              <button className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[var(--color-bad-text)] px-3 text-[12px] text-[var(--color-bad-text)]" type="button" onClick={onConfirmDelete}>
                确认删除
              </button>
              <button className={BUTTON_CLASS} type="button" onClick={onToggleDelete}>
                不删除
              </button>
            </>
          ) : (
            <button className={BUTTON_CLASS} type="button" onClick={onToggleDelete}>
              <Trash2 size={14} /> 删除技能
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

function nextSemanticCode(rows: SemanticRow[]): string {
  const usedCodes = new Set(rows.map((row) => row.code));
  let index = rows.length + 1;
  let code = `semantic-${index}`;
  while (usedCodes.has(code)) {
    index += 1;
    code = `semantic-${index}`;
  }
  return code;
}

function cloneSemanticRow(row: SemanticRow): SemanticRow {
  return {
    code: row.code,
    displayName: row.displayName,
    description: row.description,
    aliases: [...row.aliases],
    artifactPatterns: [...row.artifactPatterns],
  };
}

function normalizeSemanticRow(row: SemanticRow): SemanticRow {
  return {
    code: row.code.trim().replace(/\s+/g, '-'),
    displayName: row.displayName.trim(),
    description: row.description.trim(),
    aliases: row.aliases,
    artifactPatterns: row.artifactPatterns,
  };
}

function getSemanticValidationMessage(row: SemanticRow | null, rows: SemanticRow[], selectedCode: string | null): string | null {
  if (!row) return null;
  const normalizedCode = row.code.trim().replace(/\s+/g, '-');
  if (!normalizedCode) return '能力标识不能为空。';
  if (!row.displayName.trim()) return '显示名不能为空。';
  if (row.aliases.length === 0) return '至少填写一个技能别名，否则这条语义保存后无法匹配任何技能。';
  const duplicated = rows.some((item) => item.code === normalizedCode && item.code !== selectedCode);
  return duplicated ? `能力标识「${normalizedCode}」已存在。` : null;
}

function semanticSignature(row: SemanticRow): string {
  return JSON.stringify(normalizeSemanticRow(row));
}
