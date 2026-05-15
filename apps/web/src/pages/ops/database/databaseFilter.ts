import type { OpsColumn, OpsFilterOperator, OpsTableFilter } from '@sdd-telemetry/api';

/** UI-only operator that doesn't exist in backend contract — expands to gte+lte at submit time. */
export type UiFilterOperator = OpsFilterOperator | 'between';

export interface FilterCondition {
  id: string;
  column: string;
  operator: UiFilterOperator;
  value: string;
  valueTo?: string;
}

interface OperatorChoice {
  value: UiFilterOperator;
  label: string;
}

export const TEXT_OPERATORS: OperatorChoice[] = [
  { value: 'eq',          label: '等于 (=)' },
  { value: 'ne',          label: '不等于 (!=)' },
  { value: 'like',        label: '包含 (LIKE)' },
  { value: 'not_like',    label: '不包含 (NOT LIKE)' },
  { value: 'in',          label: '属于 (IN)' },
  { value: 'not_in',      label: '不属于 (NOT IN)' },
  { value: 'gt',          label: '大于 (>)' },
  { value: 'gte',         label: '大于等于 (>=)' },
  { value: 'lt',          label: '小于 (<)' },
  { value: 'lte',         label: '小于等于 (<=)' },
  { value: 'is_null',     label: '为空 (IS NULL)' },
  { value: 'is_not_null', label: '非空 (IS NOT NULL)' },
];

export const DATE_OPERATORS: OperatorChoice[] = [
  { value: 'between',     label: '在区间内' },
  { value: 'eq',          label: '等于 (=)' },
  { value: 'ne',          label: '不等于 (!=)' },
  { value: 'gt',          label: '大于 (>)' },
  { value: 'gte',         label: '大于等于 (>=)' },
  { value: 'lt',          label: '小于 (<)' },
  { value: 'lte',         label: '小于等于 (<=)' },
  { value: 'is_null',     label: '为空 (IS NULL)' },
  { value: 'is_not_null', label: '非空 (IS NOT NULL)' },
];

const VALUELESS: ReadonlySet<UiFilterOperator> = new Set(['is_null', 'is_not_null']);

export function isDateColumn(column: OpsColumn | undefined): boolean {
  if (!column) return false;
  const name = column.columnName.toLowerCase();
  const type = column.dataType.toLowerCase();
  return (
    type.includes('date') ||
    type.includes('time') ||
    type.includes('timestamp') ||
    name.endsWith('_at') ||
    name.endsWith('_time')
  );
}

export function operatorsForColumn(column: OpsColumn | undefined): OperatorChoice[] {
  return isDateColumn(column) ? DATE_OPERATORS : TEXT_OPERATORS;
}

export function defaultOperator(column: OpsColumn | undefined): UiFilterOperator {
  return isDateColumn(column) ? 'gte' : 'eq';
}

export function operatorNeedsValue(operator: UiFilterOperator): boolean {
  return !VALUELESS.has(operator);
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function makeCondition(columns: OpsColumn[], columnName?: string): FilterCondition {
  const column = columns.find((c) => c.columnName === columnName) ?? columns[0];
  return {
    id: makeId(),
    column: column?.columnName ?? '',
    operator: defaultOperator(column),
    value: '',
  };
}

/** Whether a condition is complete enough to be submitted as a query filter. */
export function isConditionReady(c: FilterCondition): boolean {
  if (!c.column) return false;
  if (!operatorNeedsValue(c.operator)) return true;
  if (c.operator === 'between') return Boolean(c.value && c.valueTo);
  return Boolean(c.value.trim());
}

/** Expand UI-level conditions into backend contract filters. Skips incomplete conditions. */
export function toBackendFilters(conditions: FilterCondition[]): OpsTableFilter[] {
  const result: OpsTableFilter[] = [];
  for (const c of conditions) {
    if (!isConditionReady(c)) continue;
    if (c.operator === 'between') {
      result.push({ column: c.column, operator: 'gte', value: c.value });
      result.push({ column: c.column, operator: 'lte', value: c.valueTo! });
      continue;
    }
    if (!operatorNeedsValue(c.operator)) {
      result.push({ column: c.column, operator: c.operator });
      continue;
    }
    if (c.operator === 'in' || c.operator === 'not_in') {
      const values = c.value.split(',').map((s) => s.trim()).filter(Boolean);
      result.push({ column: c.column, operator: c.operator, value: values });
      continue;
    }
    const value = c.operator === 'like' || c.operator === 'not_like'
      ? `%${c.value}%`
      : c.value;
    result.push({ column: c.column, operator: c.operator, value });
  }
  return result;
}
