import { useState } from 'react';
import type { WorkflowProfileConfig } from '@sdd-telemetry/api';
import { BUTTON_CLASS, Disclosure, MONO_TEXTAREA_CLASS, Section } from './config-ui';
import { CONFIG_FIELD_DOCS } from './field-docs';

export function AdvancedConfigSection({
  config,
  onApply,
}: {
  config: WorkflowProfileConfig;
  onApply: (next: WorkflowProfileConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));
  const [error, setError] = useState<string | null>(null);

  function openJson() {
    setText(JSON.stringify(config, null, 2));
    setError(null);
    setJsonOpen((value) => !value);
  }
  function apply() {
    try {
      onApply(JSON.parse(text) as WorkflowProfileConfig);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Section title="高级 · 底层完整配置" hint="上面的内容地图 / 技能映射,展开后就是这些底层规则">
      <Disclosure open={open} onToggle={() => setOpen((value) => !value)}>
        {open ? '收起' : '展开底层规则'}
      </Disclosure>

      {open ? (
        <div className="mt-3 grid gap-2.5">
          <div className="grid gap-1.5">
            {(Object.keys(CONFIG_FIELD_DOCS) as Array<keyof typeof CONFIG_FIELD_DOCS>).map((key) => (
              <FieldRow key={key} name={key} value={summarize((config as unknown as Record<string, unknown>)[key])} />
            ))}
          </div>

          <Disclosure open={jsonOpen} onToggle={openJson}>
            {jsonOpen ? '收起 JSON' : '直接编辑完整 JSON'}
          </Disclosure>
          {jsonOpen ? (
            <div className="grid gap-2">
              <textarea
                className={`${MONO_TEXTAREA_CLASS} min-h-[300px]`}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <button className={BUTTON_CLASS} type="button" onClick={apply}>
                  应用 JSON
                </button>
                {error ? <span className="text-[12px] text-[var(--color-bad-text)]">{error}</span> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

function FieldRow({ name, value }: { name: string; value: string }) {
  const doc = CONFIG_FIELD_DOCS[name];
  return (
    <div className="grid gap-1 rounded-[4px] border border-[var(--color-border)] bg-[#141414] px-2.5 py-2 md:grid-cols-[160px_1fr] md:items-start md:gap-3">
      <span className="font-mono text-[12px] text-[var(--color-primary)]">{name}</span>
      <div className="min-w-0">
        {doc ? <p className="text-[11px] text-[var(--color-muted)]">{doc.desc}</p> : null}
        <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-secondary)]" title={value}>
          {value}
        </p>
        {doc ? <p className="mt-0.5 text-[11px] text-[var(--color-muted)] opacity-70">例:{doc.example}</p> : null}
      </div>
    </div>
  );
}

function summarize(value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[] 空';
    const ids = value
      .map((item) => (item && typeof item === 'object' && 'ruleId' in item ? String((item as { ruleId: unknown }).ruleId) : null))
      .filter(Boolean);
    return ids.length ? `${value.length} 条:${ids.slice(0, 6).join(', ')}${ids.length > 6 ? ' …' : ''}` : `${value.length} 项`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.slice(0, 8).join(', ') + (keys.length > 8 ? ' …' : '');
  }
  return String(value);
}
