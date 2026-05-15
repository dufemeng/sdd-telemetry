import type {
  OpsColumn,
  OpsFilterOperator,
  OpsTableFilter,
  OpsTableFilterGroup,
} from '@sdd-telemetry/api';

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
  return [...TEXT_OPERATORS, ...DATE_OPERATORS].find((o) => o.value === operator)?.label ?? operator;
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

export function isConditionReady(c: FilterCondition): boolean {
  if (!c.column) return false;
  if (!operatorNeedsValue(c.operator)) return true;
  if (c.operator === 'between') return Boolean(c.value && c.valueTo);
  return Boolean(c.value.trim());
}

/** Drop empty conditions inside a group; drop the group entirely if no condition remains. */
export function compactGroup(group: FilterGroup): FilterGroup | null {
  const conditions = group.conditions.filter(isConditionReady);
  return conditions.length > 0 ? { ...group, conditions } : null;
}

export function summarizeCondition(c: FilterCondition): string {
  if (!operatorNeedsValue(c.operator)) return `${c.column} ${operatorLabel(c.operator)}`;
  if (c.operator === 'between') return `${c.column} 在 ${c.value} ~ ${c.valueTo}`;
  return `${c.column} ${operatorLabel(c.operator)} ${c.value}`;
}

export function summarizeGroup(group: FilterGroup): string {
  return group.conditions.map(summarizeCondition).join(' 或 ');
}

/** Convert a single condition (with UI operators like `between`) to one or two backend filters. */
function conditionToBackendFilters(c: FilterCondition): OpsTableFilter[] {
  if (!isConditionReady(c)) return [];
  if (c.operator === 'between') {
    return [
      { column: c.column, operator: 'gte', value: c.value },
      { column: c.column, operator: 'lte', value: c.valueTo! },
    ];
  }
  if (!operatorNeedsValue(c.operator)) {
    return [{ column: c.column, operator: c.operator }];
  }
  if (c.operator === 'in' || c.operator === 'not_in') {
    const values = c.value.split(',').map((s) => s.trim()).filter(Boolean);
    return [{ column: c.column, operator: c.operator, value: values }];
  }
  const value =
    c.operator === 'like' || c.operator === 'not_like' ? `%${c.value}%` : c.value;
  return [{ column: c.column, operator: c.operator, value }];
}

/**
 * Expand UI groups into backend filter groups.
 * Each `between` condition becomes two backend conditions that still live in the SAME group
 * (they're effectively AND'd via OR-of-two-clauses—works out semantically because a between range
 * is itself a conjunction; here the SQL ends up `... OR (col>=a OR col<=b) ...` which is wider
 * than intended). So we instead split a between row into TWO inner conditions joined by AND
 * by placing them in their own degenerate group? No—simpler: we wrap each between's two parts
 * in their OWN single-element group to AND them with the rest. But that breaks the OR within
 * group. The clean answer: a between condition must NOT mix with OR siblings. The UI enforces
 * this by emitting the between as its own group at flush time.
 */
export function toBackendFilterGroups(groups: FilterGroup[]): OpsTableFilterGroup[] {
  const result: OpsTableFilterGroup[] = [];
  for (const g of groups) {
    const readyConditions = g.conditions.filter(isConditionReady);
    if (readyConditions.length === 0) continue;

    // If any condition is `between`, it needs to AND its two halves, which conflicts with
    // OR siblings. Solution: split each between condition out into its own AND-group, and
    // keep non-between siblings in one OR-group.
    const orPart: OpsTableFilter[] = [];
    for (const c of readyConditions) {
      if (c.operator === 'between') {
        // emit its own group with two AND'd conditions — but our contract groups are OR-only.
        // Workaround: emit two single-condition groups (both must match because groups AND).
        result.push({ conditions: [{ column: c.column, operator: 'gte', value: c.value }] });
        result.push({ conditions: [{ column: c.column, operator: 'lte', value: c.valueTo! }] });
        continue;
      }
      orPart.push(...conditionToBackendFilters(c));
    }
    if (orPart.length > 0) {
      result.push({ conditions: orPart });
    }
  }
  return result;
}
