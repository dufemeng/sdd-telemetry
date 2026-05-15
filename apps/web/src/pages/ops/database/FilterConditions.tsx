import { Plus, X } from 'lucide-react';
import type { OpsColumn } from '@sdd-telemetry/api';
import { FilterValueInput } from './FilterValueInput';
import {
  defaultOperator,
  makeCondition,
  operatorsForColumn,
  type FilterCondition,
  type UiFilterOperator,
} from './databaseFilter';

interface Props {
  columns: OpsColumn[];
  conditions: FilterCondition[];
  onChange: (conditions: FilterCondition[]) => void;
}

const SELECT_CLS =
  'min-h-8 px-[10px] rounded-[4px] text-[12px] outline-none text-[var(--color-text)] bg-[var(--color-base)] border border-[rgba(255,255,255,0.10)] focus:border-[rgba(250,255,105,0.55)] transition-colors';

export function FilterConditions({ columns, conditions, onChange }: Props) {
  const update = (id: string, patch: Partial<FilterCondition>) => {
    onChange(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const remove = (id: string) => {
    onChange(conditions.filter((c) => c.id !== id));
  };

  const add = () => {
    onChange([...conditions, makeCondition(columns)]);
  };

  return (
    <div className="grid gap-2">
      {conditions.length === 0 ? (
        <p className="text-[12px] text-[var(--color-muted)]">未设置筛选条件，将显示全表前 N 行。</p>
      ) : (
        <div className="grid gap-2">
          {conditions.map((condition, index) => {
            const column = columns.find((c) => c.columnName === condition.column);
            const operators = operatorsForColumn(column);
            const effectiveOperator = operators.some((o) => o.value === condition.operator)
              ? condition.operator
              : defaultOperator(column);

            return (
              <div
                key={condition.id}
                className="grid items-center gap-2"
                style={{ gridTemplateColumns: '40px 220px 180px minmax(0,1fr) 28px' }}
              >
                <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted)] text-center">
                  {index === 0 ? 'WHERE' : 'AND'}
                </span>
                <select
                  className={SELECT_CLS}
                  value={condition.column}
                  onChange={(e) => {
                    const next = columns.find((c) => c.columnName === e.target.value);
                    update(condition.id, {
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
                  onChange={(e) =>
                    update(condition.id, {
                      operator: e.target.value as UiFilterOperator,
                      valueTo: undefined,
                    })
                  }
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
                  onChange={(v) => update(condition.id, { value: v })}
                  onChangeTo={(v) => update(condition.id, { valueTo: v })}
                />
                <button
                  type="button"
                  onClick={() => remove(condition.id)}
                  aria-label="删除条件"
                  className="grid w-7 h-7 place-items-center rounded-[4px] border-0 cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-bad-text)] hover:bg-[#202016]"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        disabled={columns.length === 0}
        className="flex items-center gap-1.5 self-start min-h-8 px-3 rounded-[4px] text-[12px] cursor-pointer text-[var(--color-secondary)] hover:text-[var(--color-primary)] hover:bg-[#202016] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ border: '1px dashed var(--color-border)', background: 'transparent' }}
      >
        <Plus size={14} />
        添加条件
      </button>
    </div>
  );
}
