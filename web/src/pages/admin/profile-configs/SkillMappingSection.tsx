import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WorkflowProfileConfig } from '@sdd-telemetry/api';
import {
  type SemanticRow,
  decodeSemanticRows,
  emptySemanticRow,
  encodeSemanticRows,
} from './config-authoring';
import { BUTTON_CLASS, Disclosure, Field, INPUT_CLASS, Section, TEXTAREA_CLASS, Warn, linesToArray } from './config-ui';

export function SkillMappingSection({
  config,
  onChange,
}: {
  config: WorkflowProfileConfig;
  onChange: (next: WorkflowProfileConfig) => void;
}) {
  const rows = decodeSemanticRows(config);
  const [openCodes, setOpenCodes] = useState<Set<string>>(new Set());

  function commit(next: SemanticRow[]) {
    onChange(encodeSemanticRows(config, next));
  }
  function updateRow(index: number, patch: Partial<SemanticRow>) {
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function removeRow(index: number) {
    commit(rows.filter((_, i) => i !== index));
  }
  function addRow() {
    const next = emptySemanticRow();
    next.code = `semantic-${rows.length + 1}`;
    next.displayName = '新能力';
    commit([...rows, next]);
    setOpenCodes((prev) => new Set(prev).add(next.code));
  }
  function toggle(code: string) {
    setOpenCodes((prev) => {
      const set = new Set(prev);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return set;
    });
  }

  return (
    <Section
      title="技能映射"
      hint="技能名 → 能力 / 产物。改别名就改了它怎么被识别"
      action={
        <button className={BUTTON_CLASS} type="button" onClick={addRow}>
          <Plus size={14} /> 新增语义
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="text-[12px] text-[var(--color-muted)]">还没有技能语义。点「新增语义」把技能名映射成能力。</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((row, index) => (
            <SemanticEditor
              key={`${row.code}-${index}`}
              row={row}
              open={openCodes.has(row.code)}
              onToggle={() => toggle(row.code)}
              onChange={(patch) => updateRow(index, patch)}
              onRemove={() => removeRow(index)}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function SemanticEditor({
  row,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  row: SemanticRow;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<SemanticRow>) => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-[6px] border border-[var(--color-border)] bg-[#141414]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <Disclosure open={open} onToggle={onToggle}>
          <span className="font-mono text-[12px] text-[#f5f5f5]">{row.code || '(未命名)'}</span>
          <span className="text-[var(--color-muted)]">·</span>
          <span className="text-[12px] text-[var(--color-secondary)]">{row.displayName || '未命名能力'}</span>
          <span className="ml-1 text-[11px] text-[var(--color-muted)]">{row.aliases.length} 个别名</span>
        </Disclosure>
        {confirming ? (
          <span className="flex items-center gap-1.5">
            <button className="text-[11px] text-[var(--color-bad-text)]" type="button" onClick={onRemove}>
              确认删除
            </button>
            <button className="text-[11px] text-[var(--color-muted)]" type="button" onClick={() => setConfirming(false)}>
              取消
            </button>
          </span>
        ) : (
          <button
            className="grid h-7 w-7 place-items-center rounded-[4px] text-[var(--color-muted)] hover:text-[var(--color-bad-text)]"
            type="button"
            onClick={() => setConfirming(true)}
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {open ? (
        <div className="grid gap-2.5 border-t border-[var(--color-border)] p-3">
          <div className="grid gap-2.5 md:grid-cols-2">
            <Field label="语义 code" hint="稳定能力编码,看板按它聚合">
              <input
                className={`${INPUT_CLASS} font-mono`}
                value={row.code}
                onChange={(event) => onChange({ code: event.target.value.trim().replace(/\s+/g, '-') })}
              />
            </Field>
            <Field label="显示名" hint="页面上展示的名字">
              <input className={INPUT_CLASS} value={row.displayName} onChange={(event) => onChange({ displayName: event.target.value })} />
            </Field>
          </div>
          <Field label="描述" hint="给配置维护者看,选填">
            <input className={INPUT_CLASS} value={row.description} onChange={(event) => onChange({ description: event.target.value })} />
          </Field>
          <Field label="技能别名" hint="匹配这些技能名,一行一个">
            <textarea
              className={`${TEXTAREA_CLASS} font-mono`}
              placeholder={'bk-fe-design\nbk-fe:design'}
              value={row.aliases.join('\n')}
              onChange={(event) => onChange({ aliases: linesToArray(event.target.value) })}
            />
          </Field>
          <Field label="产物文件名" hint="该能力产出的过程文档文件名模式,一行一个;选填">
            <textarea
              className={`${TEXTAREA_CLASS} font-mono`}
              placeholder={'design.md\ndesign-*.md'}
              value={row.artifactPatterns.join('\n')}
              onChange={(event) => onChange({ artifactPatterns: linesToArray(event.target.value) })}
            />
          </Field>
          {row.aliases.length === 0 ? <Warn>没有技能别名,这条语义不会生成任何识别规则。</Warn> : null}
        </div>
      ) : null}
    </div>
  );
}
