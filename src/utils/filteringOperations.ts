import { Op } from 'sequelize';
import type { Sequelize, WhereOptions } from 'sequelize';

/** A single parsed filter from `?filters[i][key]=...&filters[i][op]=...&filters[i][value]=...` */
export type FilterSpec = { key: string; op: string; value: string };

/**
 * Per-key filter configuration for buildWhereFromFilters.
 * - key: matches FilterSpec.key (the value sent by the client)
 * - column: either a Sequelize column path (e.g. 'property_status' or '$request.status$') or a custom builder
 *   that returns a WhereOptions fragment for full control (e.g. nested associations, JSON paths)
 * - type: 'string' = case-insensitive LIKE; 'date' = parsed as DATE range; 'timestamp' = parsed as ms range;
 *         'enum' / 'number' = pass operator straight through (equals, doesNotEqual, isAnyOf...)
 */
export type FilterColumnConfig = {
    key: string;
    column: string | ((spec: FilterSpec) => WhereOptions);
    type?: 'string' | 'date' | 'timestamp' | 'enum' | 'number';
};

/**
 * Column data shape passed to getSequelizeCondition. Only emptiness semantics depend on it:
 * a text column treats '' as empty, a non-text column ('' would coerce, e.g. numeric 0) treats only NULL as empty.
 */
export type ConditionColumnType = 'string' | 'number';

/** Operators whose semantics don't need a value; an empty value must not drop the filter. */
const VALUELESS_OPS = new Set(['isEmpty', 'isNotEmpty']);

/** True for value-less operators (isEmpty/isNotEmpty) — callers must not skip these when the filter value is empty. */
export const isValuelessOperator = (op: string): boolean => VALUELESS_OPS.has(op);

/**
 * Whether a filter has enough to act on: value-less operators always apply, every other
 * operator needs a non-empty value. Callers still validate the filter key separately.
 */
export const shouldApplyFilter = (operator: string, value: string | undefined): boolean =>
    isValuelessOperator(operator) || (value !== undefined && value !== '');

/**
 * Parse a date string in various formats (ISO, MM/DD/YYYY, MM-DD-YYYY, etc.) to a Date.
 * Returns start of day and end of day for Sequelize DATE or timestamp columns.
 */
function parseDateToRange(value: string): { start: Date; end: Date } | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  let date = new Date(trimmed);

  if (isNaN(date.getTime())) {
    const parts = trimmed.split(/[/-]/);
    if (parts.length >= 3) {
      const month = parseInt(parts[0], 10) - 1;
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
        date = new Date(year, month, day);
      }
    }
  }

  if (isNaN(date.getTime())) return null;

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Build an OR of day-range conditions for `isAnyOf` on date/timestamp columns.
 * `bound` maps a day boundary Date to the column's stored form (ISO string for DATE, ms for timestamp).
 * Unparseable entries are skipped; if nothing parses, returns a condition that matches no row.
 */
function anyOfDateRanges(value: string, bound: (d: Date) => string | number) {
  const parts = Array.isArray(value) ? value : String(value).split(',');
  const ranges = parts
    .map((v) => parseDateToRange(String(v).trim()))
    .filter((r): r is { start: Date; end: Date } => r !== null)
    .map((r) => ({ [Op.between]: [bound(r.start), bound(r.end)] }));
  return ranges.length ? { [Op.or]: ranges } : { [Op.in]: [] as unknown[] };
}

/**
 * Condition for DATE columns (createdAt, updatedAt). Parses the value as a date
 * and returns Op.between for equals, or single-bound for isBefore/isAfter.
 */
export const getSequelizeDateCondition = (operator: string, value: string) => {
  if (operator === 'isEmpty') return { [Op.is]: null };
  if (operator === 'isNotEmpty') return { [Op.not]: null };
  if (operator === 'isAnyOf') return anyOfDateRanges(value, (d) => d.toISOString());

  const range = parseDateToRange(value);
  if (!range) return { [Op.like]: `%${value}%` };

  const { start, end } = range;
  const startStr = start.toISOString();
  const endStr = end.toISOString();

  switch (operator) {
    case 'equals':
      return { [Op.between]: [startStr, endStr] };
    case 'doesNotEqual':
      return { [Op.or]: [{ [Op.lt]: startStr }, { [Op.gt]: endStr }] };
    case 'isBefore':
    case 'before':
      return { [Op.lt]: startStr };
    case 'isAfter':
    case 'after':
      return { [Op.gt]: endStr };
    case 'onOrBefore':
      return { [Op.lte]: endStr };
    case 'onOrAfter':
      return { [Op.gte]: startStr };
    default:
      return { [Op.between]: [startStr, endStr] };
  }
};

/**
 * Condition for Unix timestamp columns (e.g. property_surplus_release_date stored as ms).
 */
export const getSequelizeTimestampCondition = (operator: string, value: string,) => {
  if (operator === 'isEmpty') return { [Op.is]: null };
  if (operator === 'isNotEmpty') return { [Op.not]: null };
  if (operator === 'isAnyOf') return anyOfDateRanges(value, (d) => d.getTime());

  const range = parseDateToRange(value);
  if (!range) {
    return { [Op.eq]: -1 }; // no match for unparseable date
  }
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  switch (operator) {
    case 'equals':
      return { [Op.between]: [startMs, endMs] };
    case 'doesNotEqual':
      return { [Op.or]: [{ [Op.lt]: startMs }, { [Op.gt]: endMs }] };
    case 'isBefore':
    case 'before':
      return { [Op.lt]: startMs };
    case 'isAfter':
    case 'after':
      return { [Op.gt]: endMs };
    case 'onOrBefore':
      return { [Op.lte]: endMs };
    case 'onOrAfter':
      return { [Op.gte]: startMs };
    default:
      return { [Op.between]: [startMs, endMs] };
  }
};

/**
 * Split an `isAnyOf` value into terms. Comma is the primary separator so multi-word values
 * survive ("Test Org, Other"); with no comma the value splits on whitespace ("may april").
 */
const splitAnyOfValue = (value: string | string[]): string[] => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const parts = value.includes(',') ? value.split(',') : value.split(/\s+/);
  return parts.map((v) => v.trim()).filter(Boolean);
};

/**
 * Generic condition builder for text / numeric / enum columns.
 * `columnType` only affects isEmpty/isNotEmpty: text columns also treat '' as empty,
 * non-text columns treat only NULL as empty (matching '' there coerces and over-matches).
 */
export const getSequelizeCondition = (operator: string, value: string, columnType: ConditionColumnType = 'string') => {
  switch (operator) {
    case 'contains':
      return { [Op.like]: `%${value}%` };
    case 'doesNotContain':
      return { [Op.notLike]: `%${value}%` };
    case 'equals':
      return value;
    case 'doesNotEqual':
      return { [Op.ne]: value };
    case 'startsWith':
      return { [Op.like]: `${value}%` };
    case 'endsWith':
      return { [Op.like]: `%${value}` };
    case 'isEmpty':
      return columnType === 'string' ? { [Op.or]: [{ [Op.is]: null }, { [Op.eq]: '' }] } : { [Op.is]: null };
    case 'isNotEmpty':
      return columnType === 'string' ? { [Op.and]: [{ [Op.not]: null }, { [Op.ne]: '' }] } : { [Op.not]: null };
    case 'isAnyOf':
      return { [Op.in]: splitAnyOfValue(value) };
    case 'gt':
    case 'greaterThan':
      return { [Op.gt]: value };
    case 'gte':
    case 'greaterThanOrEqual':
      return { [Op.gte]: value };
    case 'lt':
    case 'lessThan':
      return { [Op.lt]: value };
    case 'lte':
    case 'lessThanOrEqual':
      return { [Op.lte]: value };
    default:
      return { [Op.like]: `%${value}%` };
  }
};

/**
 * Case-insensitive condition for text columns (uses LOWER(column) and lowercased value).
 * Use for all string filters so search is case-insensitive regardless of DB collation.
 */
export const getSequelizeCaseInsensitiveCondition = (sequelize: Sequelize, columnRef: string, operator: string, value: string) => {
  // NULL / empty-string checks aren't case-sensitive — emit a plain column condition, no LOWER() wrap.
  if (VALUELESS_OPS.has(operator)) return getSequelizeCondition(operator, '');
  const lowered = typeof value === 'string' ? value.toLowerCase() : String(value);
  const rhs = getSequelizeCondition(operator, lowered);
  return sequelize.where(sequelize.fn('LOWER', sequelize.col(columnRef)), rhs);
};

/**
 * Parse `req.query.filters` (Express+qs decodes bracket notation `filters[i][key]=...` to an array of objects)
 * into a normalized FilterSpec[]. Tolerates missing/garbage values — returns empty array.
 *
 * Also accepts the legacy single-filter shape (`filterKey`/`filterValue`/`operator`) and converts it,
 * so old clients keep working during rollout.
 */
export const parseFiltersFromQuery = (query: any): FilterSpec[] => {
    const raw = query?.filters;
    if (Array.isArray(raw)) {
        return raw
            .filter((f) => {
                if (!f || typeof f !== 'object' || f.key == null) return false;
                const op = String(f.op || f.operator || 'contains');
                if (VALUELESS_OPS.has(op)) return true;
                return f.value != null && f.value !== '';
            })
            .map((f) => ({
                key: String(f.key),
                op: String(f.op || f.operator || 'contains'),
                value: f.value == null ? '' : String(f.value),
            }));
    }
    const legacyKey = query?.filterKey;
    const legacyValue = query?.filterValue;
    const legacyOp = String(query?.operator || 'contains');
    if (legacyKey && (VALUELESS_OPS.has(legacyOp) || (legacyValue != null && legacyValue !== ''))) {
        return [{ key: String(legacyKey), op: legacyOp, value: legacyValue == null ? '' : String(legacyValue) }];
    }
    return [];
};

/**
 * Normalize legacy single-filter params + new filters[] into a single FilterSpec[].
 * If `filters` is non-empty it wins (frontend opted into the new shape);
 * otherwise legacy `filterKey`/`operator`/`filterValue` are wrapped into a one-element array.
 *
 * Use at service boundary to keep public method signatures backwards-compatible.
 */
export const filtersFromLegacy = (
    filterKey?: string,
    operator?: string,
    filterValue?: string,
    filters?: FilterSpec[],
): FilterSpec[] => {
    if (filters && filters.length > 0) return filters;
    if (!filterKey) return [];
    const op = String(operator || 'contains');
    if (VALUELESS_OPS.has(op)) {
        return [{ key: String(filterKey), op, value: '' }];
    }
    if (filterValue !== undefined && filterValue !== '') {
        /** Legacy callsites sometimes pass numbers as filterValue; preserve type so downstream helpers see exactly what they did before. */
        return [{ key: String(filterKey), op, value: filterValue as string }];
    }
    return [];
};

/**
 * Build a Sequelize WhereOptions from FilterSpec[] using per-key column configs. Filters are AND-combined.
 * Unknown keys are silently dropped (so a stale frontend doesn't blow up the backend).
 *
 * Pass `sequelize` when any 'string'-type column needs case-insensitive matching (LOWER(col)).
 */
export const buildWhereFromFilters = (
    filters: FilterSpec[],
    configs: FilterColumnConfig[],
    sequelize?: Sequelize,
): WhereOptions => {
    const conditions: WhereOptions[] = [];
    for (const filter of filters) {
        const config = configs.find((c) => c.key === filter.key);
        if (!config) continue;

        if (typeof config.column === 'function') {
            conditions.push(config.column(filter));
            continue;
        }

        let condition: WhereOptions;
        switch (config.type) {
            case 'date':
                condition = { [config.column]: getSequelizeDateCondition(filter.op, filter.value) } as WhereOptions;
                break;
            case 'timestamp':
                condition = { [config.column]: getSequelizeTimestampCondition(filter.op, filter.value) } as WhereOptions;
                break;
            case 'enum':
            case 'number':
                condition = { [config.column]: getSequelizeCondition(filter.op, filter.value, 'number') } as WhereOptions;
                break;
            case 'string':
            default:
                // Value-less ops skip the LOWER() wrap and stay keyed by column, like the non-sequelize branch.
                condition = sequelize && !isValuelessOperator(filter.op)
                    ? getSequelizeCaseInsensitiveCondition(sequelize, config.column, filter.op, filter.value) as WhereOptions
                    : { [config.column]: getSequelizeCondition(filter.op, filter.value) } as WhereOptions;
                break;
        }
        conditions.push(condition);
    }
    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { [Op.and]: conditions } as WhereOptions;
};
