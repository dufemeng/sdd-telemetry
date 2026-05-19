import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useCreateSddSemantic } from './useSddSemantics';
import { Panel } from '@/components/ui/Panel';

export function CreateSemanticForm() {
  const [code,    setCode]    = useState('');
  const [name,    setName]    = useState('');
  const [aliases, setAliases] = useState('');
  const mutation = useCreateSddSemantic();

  const inputCls = 'w-full min-h-8 px-[10px] rounded-[4px] text-[12px] text-[var(--color-text)] outline-none bg-[var(--color-base)] border border-[rgba(255,255,255,0.10)] focus:border-[rgba(250,255,105,0.55)] transition-colors';

  return (
    <Panel title="新增语义" icon={<Plus size={18} />}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(
            {
              semanticCode: code,
              displayName:  name,
              aliases:      aliases.split('\n').map((s) => s.trim()).filter(Boolean),
            },
            {
              onSuccess: () => {
                setCode(''); setName(''); setAliases('');
              },
            },
          );
        }}
      >
        <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
          语义编码
          <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
          展示名
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
          技能别名（每行一个）
          <textarea
            className={`${inputCls} min-h-[108px] p-2 resize-y`}
            placeholder="每行一个 alias"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="min-h-[34px] rounded-[4px] font-bold text-[var(--color-base)] bg-[var(--color-primary)] disabled:opacity-65 disabled:cursor-not-allowed border-0 cursor-pointer"
        >
          {mutation.isPending ? '提交中…' : '新增语义'}
        </button>
        {mutation.error && (
          <p className="text-[12px] text-[var(--color-bad-text)]">{mutation.error.message}</p>
        )}
      </form>
    </Panel>
  );
}
