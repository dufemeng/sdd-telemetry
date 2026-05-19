import { useEffect, useRef, useState } from 'react';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { useCreateSddSemantic, useDeleteSddSemantic, useUpdateSddSemantic } from './useSddSemantics';
import { Panel } from '@/components/ui/Panel';
import type { SddSemantic } from '@sdd-telemetry/api';

const inputCls =
  'w-full min-h-8 px-[10px] rounded-[4px] text-[12px] text-[var(--color-text)] outline-none bg-[var(--color-base)] border border-[rgba(255,255,255,0.10)] focus:border-[rgba(250,255,105,0.55)] transition-colors';

interface Props {
  selected: SddSemantic | null;
  onDeleteSuccess: () => void;
}

export function SemanticForm({ selected, onDeleteSuccess }: Props) {
  const isEdit = selected !== null;

  const [code,    setCode]    = useState('');
  const [name,    setName]    = useState('');
  const [description, setDescription] = useState('');
  const [aliases, setAliases] = useState('');
  const [artifactFilenamePatterns, setArtifactFilenamePatterns] = useState('');
  const [patternsTouched, setPatternsTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createMutation = useCreateSddSemantic();
  const updateMutation = useUpdateSddSemantic();
  const deleteMutation = useDeleteSddSemantic();

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const error = createMutation.error ?? updateMutation.error ?? deleteMutation.error;

  useEffect(() => {
    if (selected) {
      setName(selected.displayName);
      setDescription(selected.description ?? '');
      setAliases(selected.aliases.map((a) => a.skillName).join('\n'));
      setArtifactFilenamePatterns(selected.artifactFilenamePatterns?.join('\n') ?? '');
    } else {
      setCode('');
      setName('');
      setDescription('');
      setAliases('');
      setArtifactFilenamePatterns('');
    }
    setPatternsTouched(false);
    setConfirming(false);
    createMutation.reset();
    updateMutation.reset();
    deleteMutation.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const linesToArray = (value: string) => value.split('\n').map((s) => s.trim()).filter(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const descriptionValue = description.trim() || undefined;
    const patternsValue = linesToArray(artifactFilenamePatterns);

    if (isEdit) {
      const body = {
        displayName: name,
        description: descriptionValue,
        aliases: linesToArray(aliases),
      };

      if (selected.artifactFilenamePatterns !== null || patternsTouched) {
        Object.assign(body, { artifactFilenamePatterns: patternsValue });
      }

      updateMutation.mutate({
        id: selected.id,
        body,
      });
    } else {
      const body = {
        semanticCode: code,
        displayName: name,
        description: descriptionValue,
        aliases: linesToArray(aliases),
      };

      if (patternsValue.length > 0) {
        Object.assign(body, { artifactFilenamePatterns: patternsValue });
      }

      createMutation.mutate(
        body,
        {
          onSuccess: () => {
            setCode('');
            setName('');
            setDescription('');
            setAliases('');
            setArtifactFilenamePatterns('');
            setPatternsTouched(false);
          },
        },
      );
    }
  };

  const handleDeleteClick = () => {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    deleteMutation.mutate(selected!.id, { onSuccess: onDeleteSuccess });
  };

  return (
    <Panel
      title={isEdit ? '编辑语义' : '新增语义'}
      icon={isEdit ? <Edit2 size={18} /> : <Plus size={18} />}
    >
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
          语义编码
          <input
            className={isEdit ? `${inputCls} opacity-50 cursor-not-allowed` : inputCls}
            value={isEdit ? selected.semanticCode : code}
            onChange={isEdit ? undefined : (e) => setCode(e.target.value)}
            readOnly={isEdit}
            required={!isEdit}
          />
        </label>

        <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
          展示名
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>

        <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
          描述
          <textarea
            className={`${inputCls} min-h-[72px] p-2 resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
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

        <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
          Artifact 文件名模式（每行一个）
          <textarea
            className={`${inputCls} min-h-[92px] p-2 resize-y`}
            placeholder="design-*.md"
            value={artifactFilenamePatterns}
            onChange={(e) => {
              setArtifactFilenamePatterns(e.target.value);
              setPatternsTouched(true);
            }}
          />
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="min-h-[34px] rounded-[4px] font-bold text-[var(--color-base)] bg-[var(--color-primary)] disabled:opacity-65 disabled:cursor-not-allowed border-0 cursor-pointer"
        >
          {isPending && !deleteMutation.isPending ? '提交中…' : isEdit ? '保存修改' : '新增语义'}
        </button>

        {isEdit && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleDeleteClick}
            className={[
              'min-h-[34px] rounded-[4px] font-bold border cursor-pointer flex items-center justify-center gap-2 transition-colors disabled:opacity-65 disabled:cursor-not-allowed',
              confirming
                ? 'bg-[var(--color-bad-text)] text-white border-transparent'
                : 'bg-transparent text-[var(--color-bad-text)] border-[var(--color-bad-text)]',
            ].join(' ')}
          >
            <Trash2 size={14} />
            {confirming ? '确认删除？' : '删除语义'}
          </button>
        )}

        {error && (
          <p className="text-[12px] text-[var(--color-bad-text)]">{error.message}</p>
        )}
      </form>
    </Panel>
  );
}
