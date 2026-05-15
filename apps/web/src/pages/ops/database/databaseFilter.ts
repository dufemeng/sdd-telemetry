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

export interface FilterGroup {
  id: string;
  conditions: FilterCondition[];
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

export function operatorLabel(operator: UiFilterOperator): string {
  const all = [...TEXT_OPERATORS, ...DATE_OPERATORS];
  return all.find((item) => item.value === operator)?.label ?? operator;
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

export function makeGroup(columns: OpsColumn[]): FilterGroup {
  return { id: makeId(), conditions: [makeCondition(columns)] };
}

/** Drop conditions with no value (except IS NULL / IS NOT NULL which need none). */
export function compactGroup(group: FilterGroup): FilterGroup | null {
  const conditions = group.conditions.filter((c) => {
    if (!c.column) return false;
    if (!operatorNeedsValue(c.operator)) return true;
    if (c.operator === 'between') return Boolean(c.value && c.valueTo);
    if (c.operator === 'in' || c.operator === 'not_in') return Boolean(c.value.trim());
    return Boolean(c.value);
  });
  return conditions.length > 0 ? { ...group, conditions } : null;
}

export function summarizeGroup(group: FilterGroup): string {
  return group.conditions
    .map((c) => {
      if (!operatorNeedsValue(c.operator)) return `${c.column} ${operatorLabel(c.operator)}`;
      if (c.operator === 'between') return `${c.column} 在 ${c.value} ~ ${c.valueTo}`;
      return `${c.column} ${operatorLabel(c.operator)} ${c.value}`;
    })
    .join(' 且 ');
}

/** Expand UI-level conditions into backend contract filters. `between` → `gte` + `lte`. */
export function toBackendFilters(groups: FilterGroup[]): OpsTableFilter[] {
  const result: OpsTableFilter[] = [];
  for (const group of groups) {
    for (const c of group.conditions) {
      if (c.operator === 'between') {
        if (c.value)   result.push({ column: c.column, operator: 'gte', value: c.value });
        if (c.valueTo) result.push({ column: c.column, operator: 'lte', value: c.valueTo });
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
  }
  return result;
}
