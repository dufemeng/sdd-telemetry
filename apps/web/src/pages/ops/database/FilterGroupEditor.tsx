import { Plus, X } from 'lucide-react';
import type { OpsColumn } from '@sdd-telemetry/api';
import { FilterValueInput } from './FilterValueInput';
import {
  defaultOperator,
  makeCondition,
  operatorsForColumn,
  type FilterCondition,
  type FilterGroup,
  type UiFilterOperator,
} from './databaseFilter';

interface Props {
  columns: OpsColumn[];
  group: FilterGroup;
  onChange: (group: FilterGroup) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onDelete?: () => void;
}

const SELECT_CLS =
  'min-h-8 px-[10px] rounded-[4px] text-[12px] outline-none text-[var(--color-text)] bg-[var(--color-base)] border border-[rgba(255,255,255,0.10)] focus:border-[rgba(250,255,105,0.55)] transition-colors';

export function FilterGroupEditor({ columns, group, onChange, onCancel, onConfirm, onDelete }: Props) {
  const updateCondition = (id: string, patch: Partial<FilterCondition>) => {
    onChange({
      ...group,
      conditions: group.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const removeCondition = (id: string) => {
    onChange({ ...group, conditions: group.conditions.filter((c) => c.id !== id) });
  };

  const addCondition = () => {
    onChange({ ...group, conditions: [...group.conditions, makeCondition(columns)] });
  };

  return (
    <div
      className="grid gap-3 p-3 rounded-[6px]"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      role="dialog"
      aria-label="筛选条件编辑"
    >
      <div className="text-[11px] font-bold tracking-[0.05em] text-[var(--color-muted)] uppercase">
        同时满足以下所有条件
      </div>
      <div className="grid gap-2">
        {group.conditions.map((condition) => {
          const column = columns.find((c) => c.columnName === condition.column);
          const operators = operatorsForColumn(column);
          const effectiveOperator = operators.some((o) => o.value === condition.operator)
            ? condition.operator
            : defaultOperator(column);

          return (
            <div
              key={condition.id}
              className="grid items-center gap-2"
              style={{ gridTemplateColumns: '180px 180px minmax(0,1fr) 28px' }}
            >
              <select
                className={SELECT_CLS}
                value={condition.column}
                onChange={(e) => {
                  const next = columns.find((c) => c.columnName === e.target.value);
                  updateCondition(condition.id, {
                    column: e.target.value,
                    operator: defaultOperator(next),
                    value: '',
                    valueTo: undefined,
                  });
                }}
              >
                {columns.map((c) => (
                  <option key={c.columnName} value={c.columnName}>
                    {c.columnName} &lt;{c.dataType || 'TEXT'}&gt;
                  </option>
                ))}
              </select>
              <select
                className={SELECT_CLS}
                value={effectiveOperator}
                onChange={(e) => {
                  updateCondition(condition.id, {
                    operator: e.target.value as UiFilterOperator,
                    valueTo: undefined,
                  });
                }}
              >
                {operators.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <FilterValueInput
                condition={{ ...condition, operator: effectiveOperator }}
                column={column}
                onChange={(v) => updateCondition(condition.id, { value: v })}
                onChangeTo={(v) => updateCondition(condition.id, { valueTo: v })}
              />
              <button
                type="button"
                onClick={() => removeCondition(condition.id)}
                aria-label="删除条件"
                className="grid w-7 h-7 place-items-center rounded-[4px] border-0 cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-bad-text)] hover:bg-[#202016]"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addCondition}
        className="flex items-center gap-1.5 self-start min-h-8 px-3 rounded-[4px] text-[12px] text-[var(--color-secondary)] cursor-pointer hover:text-[var(--color-primary)] hover:bg-[#202016]"
        style={{ border: '1px dashed var(--color-border)', background: 'transparent' }}
      >
        <Plus size={14} />
        添加条件
      </button>
      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="min-h-8 px-3 rounded-[4px] text-[12px] cursor-pointer text-[var(--color-bad-text)]"
            style={{ border: '1px solid var(--color-border)', background: 'transparent' }}
          >
            删除筛选组
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="min-h-8 px-3 rounded-[4px] text-[12px] cursor-pointer text-[var(--color-secondary)]"
          style={{ border: '1px solid var(--color-border)', background: 'transparent' }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-8 px-3 rounded-[4px] text-[12px] font-bold cursor-pointer text-[var(--color-base)] bg-[var(--color-primary)] border-0"
        >
          确定
        </button>
      </div>
    </div>
  );
}
