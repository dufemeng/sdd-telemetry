import type { OpsColumn } from '@sdd-telemetry/api';
import { isDateColumn, operatorNeedsValue, type FilterCondition } from './databaseFilter';

interface Props {
  condition: FilterCondition;
  column: OpsColumn | undefined;
  onChange: (value: string) => void;
  onChangeTo: (value: string) => void;
}

const INPUT_CLS =
  'min-h-8 px-[10px] rounded-[4px] text-[12px] outline-none text-[var(--color-text)] bg-[var(--color-base)] border border-[rgba(255,255,255,0.10)] focus:border-[rgba(250,255,105,0.55)] transition-colors';

function toDateInputValue(value: string): string {
  if (!value) return '';
  return value.replace(' ', 'T').replace(/Z$/, '').replace(/\.\d+$/, '').slice(0, 19);
}

function fromDateInputValue(value: string): string {
  if (!value) return '';
  return value.length === 16 ? `${value}:00` : value;
}

export function FilterValueInput({ condition, column, onChange, onChangeTo }: Props) {
  if (!operatorNeedsValue(condition.operator)) {
    return (
      <span className="text-[11px] text-[var(--color-muted)] self-center min-w-0 px-2">
        无需输入值
      </span>
    );
  }

  const dateColumn = isDateColumn(column);
  const inputType = dateColumn ? 'datetime-local' : 'text';
  const placeholder =
    condition.operator === 'in' || condition.operator === 'not_in'
      ? '逗号分隔多个值'
      : '输入匹配值';

  if (condition.operator === 'between') {
    const inputValue   = dateColumn ? toDateInputValue(condition.value)         : condition.value;
    const inputValueTo = dateColumn ? toDateInputValue(condition.valueTo ?? '') : condition.valueTo ?? '';
    const handler = (v: string) => (dateColumn ? fromDateInputValue(v) : v);
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <input
          type={inputType}
          step={dateColumn ? 1 : undefined}
          className={`${INPUT_CLS} min-w-0 flex-1`}
          value={inputValue}
          onChange={(e) => onChange(handler(e.target.value))}
          placeholder="开始值"
        />
        <span className="text-[11px] text-[var(--color-muted)]">至</span>
        <input
          type={inputType}
          step={dateColumn ? 1 : undefined}
          className={`${INPUT_CLS} min-w-0 flex-1`}
          value={inputValueTo}
          onChange={(e) => onChangeTo(handler(e.target.value))}
          placeholder="结束值"
        />
      </div>
    );
  }

  const inputValue = dateColumn ? toDateInputValue(condition.value) : condition.value;
  return (
    <input
      type={inputType}
      step={dateColumn ? 1 : undefined}
      className={`${INPUT_CLS} flex-1 min-w-0`}
      value={inputValue}
      onChange={(e) => onChange(dateColumn ? fromDateInputValue(e.target.value) : e.target.value)}
      placeholder={placeholder}
    />
  );
}
