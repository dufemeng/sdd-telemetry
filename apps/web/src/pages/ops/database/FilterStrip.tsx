import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { OpsColumn } from '@sdd-telemetry/api';
import { FilterGroupEditor } from './FilterGroupEditor';
import { compactGroup, makeGroup, summarizeGroup, type FilterGroup } from './databaseFilter';

interface Props {
  columns: OpsColumn[];
  groups: FilterGroup[];
  onGroupsChange: (groups: FilterGroup[]) => void;
}

export function FilterStrip({ columns, groups, onGroupsChange }: Props) {
  const [draft, setDraft] = useState<FilterGroup | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const startNew = () => {
    if (draft) return; // already editing — prevent overwrite
    setEditingId(null);
    setDraft(makeGroup(columns));
  };

  const startEdit = (group: FilterGroup) => {
    if (draft) return;
    setEditingId(group.id);
    setDraft(group);
  };

  const close = () => {
    setDraft(null);
    setEditingId(null);
  };

  const confirm = () => {
    if (!draft) return;
    const compacted = compactGroup(draft);
    if (editingId) {
      onGroupsChange(
        compacted
          ? groups.map((g) => (g.id === editingId ? compacted : g))
          : groups.filter((g) => g.id !== editingId),
      );
    } else if (compacted) {
      onGroupsChange([...groups, compacted]);
    }
    close();
  };

  const remove = () => {
    if (editingId) {
      onGroupsChange(groups.filter((g) => g.id !== editingId));
    }
    close();
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((group, index) => (
          <div key={group.id} className="flex items-center gap-2">
            {index > 0 && (
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted)]">
                且
              </span>
            )}
            <button
              type="button"
              onClick={() => startEdit(group)}
              disabled={Boolean(draft)}
              className="min-h-8 px-3 rounded-[4px] text-[12px] cursor-pointer text-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                border: '1px solid rgba(250,255,105,0.30)',
                background: 'rgba(250,255,105,0.08)',
              }}
            >
              {summarizeGroup(group)}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={startNew}
          disabled={columns.length === 0 || Boolean(draft)}
          className="flex items-center gap-1.5 min-h-8 px-3 rounded-[4px] text-[12px] cursor-pointer text-[var(--color-secondary)] hover:text-[var(--color-primary)] hover:bg-[#202016] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ border: '1px dashed var(--color-border)', background: 'transparent' }}
        >
          <Plus size={14} />
          添加筛选条件
        </button>
      </div>
      {draft && (
        <FilterGroupEditor
          columns={columns}
          group={draft}
          onChange={setDraft}
          onCancel={close}
          onConfirm={confirm}
          onDelete={editingId ? remove : undefined}
        />
      )}
    </div>
  );
}
