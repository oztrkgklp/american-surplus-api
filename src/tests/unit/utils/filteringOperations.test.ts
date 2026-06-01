/**
 * Unit tests for the multi-filter helpers added in SDN-1306:
 * - parseFiltersFromQuery  (req.query → FilterSpec[])
 * - filtersFromLegacy      (legacy single-filter args + filters[] → FilterSpec[])
 * - buildWhereFromFilters  (FilterSpec[] + column configs → Sequelize WhereOptions)
 *
 * Existing single-filter helpers (getSequelizeCondition / getSequelizeDateCondition / ...)
 * are exercised indirectly through buildWhereFromFilters.
 */

const Op = {
    like: Symbol('like'),
    notLike: Symbol('notLike'),
    eq: Symbol('eq'),
    ne: Symbol('ne'),
    lt: Symbol('lt'),
    gt: Symbol('gt'),
    lte: Symbol('lte'),
    gte: Symbol('gte'),
    between: Symbol('between'),
    or: Symbol('or'),
    and: Symbol('and'),
    not: Symbol('not'),
    is: Symbol('is'),
    in: Symbol('in'),
};

jest.mock('sequelize', () => ({ Op }));

import {
    parseFiltersFromQuery,
    filtersFromLegacy,
    buildWhereFromFilters,
    getSequelizeCondition,
    getSequelizeDateCondition,
    getSequelizeTimestampCondition,
    getSequelizeCaseInsensitiveCondition,
    isValuelessOperator,
    shouldApplyFilter,
    type FilterSpec,
    type FilterColumnConfig,
} from '@/utils/filteringOperations';

describe('filteringOperations — parseFiltersFromQuery', () => {
    it('returns empty array for undefined query', () => {
        expect(parseFiltersFromQuery(undefined)).toEqual([]);
    });

    it('returns empty array for empty object', () => {
        expect(parseFiltersFromQuery({})).toEqual([]);
    });

    it('returns empty array if filters is not an array', () => {
        expect(parseFiltersFromQuery({ filters: 'not-an-array' })).toEqual([]);
        expect(parseFiltersFromQuery({ filters: { key: 'x', value: 'y' } })).toEqual([]);
        expect(parseFiltersFromQuery({ filters: 42 })).toEqual([]);
    });

    it('parses a well-formed array of filter objects', () => {
        const query = {
            filters: [
                { key: 'property_status', op: 'equals', value: 'DENIED' },
                { key: 'organization', op: 'contains', value: 'Acme' },
            ],
        };
        expect(parseFiltersFromQuery(query)).toEqual([
            { key: 'property_status', op: 'equals', value: 'DENIED' },
            { key: 'organization', op: 'contains', value: 'Acme' },
        ]);
    });

    it('skips items missing key', () => {
        const query = {
            filters: [
                { op: 'equals', value: 'X' },
                { key: 'good_one', op: 'equals', value: 'Y' },
            ],
        };
        expect(parseFiltersFromQuery(query)).toEqual([
            { key: 'good_one', op: 'equals', value: 'Y' },
        ]);
    });

    it('skips items with null/undefined value', () => {
        const query = {
            filters: [
                { key: 'a', op: 'equals', value: null },
                { key: 'b', op: 'equals', value: undefined },
                { key: 'c', op: 'equals', value: 'kept' },
            ],
        };
        expect(parseFiltersFromQuery(query)).toEqual([
            { key: 'c', op: 'equals', value: 'kept' },
        ]);
    });

    it('drops items with empty string value at parse time', () => {
        // Aligns with the legacy fallback: empty filterValue is treated as "no filter".
        // applyXFilter helpers in services also defend against this, but parsing is the first gate.
        const query = { filters: [{ key: 'a', value: '' }] };
        expect(parseFiltersFromQuery(query)).toEqual([]);
    });

    it('keeps a filter with op=isEmpty even when value is empty/missing', () => {
        // Valueless ops dropped at parse time would silently disable the entire operator.
        expect(parseFiltersFromQuery({ filters: [{ key: 'a', op: 'isEmpty', value: '' }] })).toEqual([
            { key: 'a', op: 'isEmpty', value: '' },
        ]);
        expect(parseFiltersFromQuery({ filters: [{ key: 'a', op: 'isEmpty' }] })).toEqual([
            { key: 'a', op: 'isEmpty', value: '' },
        ]);
        expect(parseFiltersFromQuery({ filters: [{ key: 'a', op: 'isNotEmpty', value: null }] })).toEqual([
            { key: 'a', op: 'isNotEmpty', value: '' },
        ]);
    });

    it('legacy fallback: keeps isEmpty/isNotEmpty even when filterValue is empty', () => {
        expect(parseFiltersFromQuery({ filterKey: 'name', operator: 'isEmpty' })).toEqual([
            { key: 'name', op: 'isEmpty', value: '' },
        ]);
        expect(parseFiltersFromQuery({ filterKey: 'name', operator: 'isNotEmpty', filterValue: '' })).toEqual([
            { key: 'name', op: 'isNotEmpty', value: '' },
        ]);
    });

    it('defaults op to "contains" when missing', () => {
        const query = { filters: [{ key: 'x', value: 'y' }] };
        expect(parseFiltersFromQuery(query)).toEqual([{ key: 'x', op: 'contains', value: 'y' }]);
    });

    it('accepts "operator" as alias for "op"', () => {
        const query = { filters: [{ key: 'x', operator: 'startsWith', value: 'y' }] };
        expect(parseFiltersFromQuery(query)).toEqual([
            { key: 'x', op: 'startsWith', value: 'y' },
        ]);
    });

    it('coerces non-string key/op/value to string', () => {
        const query = { filters: [{ key: 123, op: 456, value: 789 }] };
        expect(parseFiltersFromQuery(query)).toEqual([
            { key: '123', op: '456', value: '789' },
        ]);
    });

    it('drops non-object items in the array', () => {
        const query = { filters: [null, 'string', 42, { key: 'a', value: 'b' }, undefined] };
        expect(parseFiltersFromQuery(query)).toEqual([{ key: 'a', op: 'contains', value: 'b' }]);
    });

    it('falls back to legacy filterKey/filterValue/operator when filters not present', () => {
        const query = { filterKey: 'status', filterValue: 'ACTIVE', operator: 'equals' };
        expect(parseFiltersFromQuery(query)).toEqual([
            { key: 'status', op: 'equals', value: 'ACTIVE' },
        ]);
    });

    it('legacy fallback: defaults op to "contains" when operator missing', () => {
        const query = { filterKey: 'name', filterValue: 'Alice' };
        expect(parseFiltersFromQuery(query)).toEqual([
            { key: 'name', op: 'contains', value: 'Alice' },
        ]);
    });

    it('legacy fallback: returns [] if filterKey present but filterValue missing/empty', () => {
        expect(parseFiltersFromQuery({ filterKey: 'name' })).toEqual([]);
        expect(parseFiltersFromQuery({ filterKey: 'name', filterValue: '' })).toEqual([]);
        expect(parseFiltersFromQuery({ filterKey: 'name', filterValue: null })).toEqual([]);
    });

    it('legacy fallback: returns [] if filterKey missing', () => {
        expect(parseFiltersFromQuery({ filterValue: 'orphan' })).toEqual([]);
    });

    it('prefers filters[] over legacy when both present', () => {
        const query = {
            filterKey: 'legacy_key',
            filterValue: 'legacy_val',
            operator: 'contains',
            filters: [{ key: 'modern_key', op: 'equals', value: 'modern_val' }],
        };
        expect(parseFiltersFromQuery(query)).toEqual([
            { key: 'modern_key', op: 'equals', value: 'modern_val' },
        ]);
    });

    it('treats an empty filters[] as empty (does NOT fall back to legacy)', () => {
        // Frontend explicitly clearing filters should not silently re-enable legacy slot.
        const query = {
            filterKey: 'legacy_key',
            filterValue: 'legacy_val',
            filters: [],
        };
        expect(parseFiltersFromQuery(query)).toEqual([]);
    });
});

describe('filteringOperations — filtersFromLegacy', () => {
    it('returns filters[] when non-empty', () => {
        const filters: FilterSpec[] = [{ key: 'a', op: 'equals', value: 'b' }];
        expect(filtersFromLegacy('legacy', 'contains', 'val', filters)).toEqual(filters);
    });

    it('falls back to legacy single-element when filters[] is undefined', () => {
        expect(filtersFromLegacy('name', 'contains', 'Alice', undefined)).toEqual([
            { key: 'name', op: 'contains', value: 'Alice' },
        ]);
    });

    it('falls back to legacy single-element when filters[] is empty', () => {
        expect(filtersFromLegacy('name', 'contains', 'Alice', [])).toEqual([
            { key: 'name', op: 'contains', value: 'Alice' },
        ]);
    });

    it('returns empty array when nothing useful is provided', () => {
        expect(filtersFromLegacy()).toEqual([]);
        expect(filtersFromLegacy(undefined, undefined, undefined, undefined)).toEqual([]);
        expect(filtersFromLegacy('', '', '', [])).toEqual([]);
    });

    it('returns empty array when filterKey missing even if value present', () => {
        expect(filtersFromLegacy(undefined, 'equals', 'orphan', undefined)).toEqual([]);
    });

    it('returns empty array when filterValue is undefined or empty string', () => {
        expect(filtersFromLegacy('name', 'equals', undefined)).toEqual([]);
        expect(filtersFromLegacy('name', 'equals', '')).toEqual([]);
    });

    it('defaults op to "contains" when operator missing', () => {
        expect(filtersFromLegacy('name', undefined, 'Alice')).toEqual([
            { key: 'name', op: 'contains', value: 'Alice' },
        ]);
    });

    it('coerces legacy key/op to string but preserves filterValue type as-is', () => {
        // Legacy callsites historically pass numeric filterValue (e.g. property_quantity = 5);
        // we coerce key/op to be safe but pass the value through untouched so downstream getSequelizeCondition
        // sees exactly what it did before SDN-1306.
        // @ts-expect-error — testing runtime coercion
        expect(filtersFromLegacy(123, 456, 789)).toEqual([
            { key: '123', op: '456', value: 789 },
        ]);
    });
});

describe('filteringOperations — buildWhereFromFilters', () => {
    const configs: FilterColumnConfig[] = [
        { key: 'status', column: 'status', type: 'enum' },
        { key: 'qty', column: 'quantity', type: 'number' },
        { key: 'created', column: 'createdAt', type: 'date' },
        { key: 'releaseTs', column: 'release_date', type: 'timestamp' },
        { key: 'name', column: 'Property.name', type: 'string' },
        { key: 'custom', column: (spec) => ({ custom_col: { custom: spec.value } }) },
    ];

    it('returns {} for empty filters', () => {
        expect(buildWhereFromFilters([], configs)).toEqual({});
    });

    it('skips unknown keys silently', () => {
        const result = buildWhereFromFilters(
            [{ key: 'no_such_key', op: 'equals', value: 'X' }],
            configs,
        );
        expect(result).toEqual({});
    });

    it('returns single condition unwrapped (no Op.and wrapper)', () => {
        const result = buildWhereFromFilters(
            [{ key: 'status', op: 'equals', value: 'ACTIVE' }],
            configs,
        ) as Record<string, unknown>;
        // type 'enum' uses getSequelizeCondition which returns the bare value for 'equals'
        expect(result).toEqual({ status: 'ACTIVE' });
        expect((result as any)[Op.and]).toBeUndefined();
    });

    it('AND-wraps multiple conditions under Op.and', () => {
        const result = buildWhereFromFilters(
            [
                { key: 'status', op: 'equals', value: 'ACTIVE' },
                { key: 'qty', op: 'equals', value: '5' },
            ],
            configs,
        ) as Record<symbol, unknown>;
        expect(result[Op.and]).toBeDefined();
        expect((result[Op.and] as unknown[]).length).toBe(2);
    });

    it('routes type "enum" through getSequelizeCondition', () => {
        const result = buildWhereFromFilters(
            [{ key: 'status', op: 'contains', value: 'ACT' }],
            configs,
        ) as Record<string, unknown>;
        expect(result.status).toEqual({ [Op.like]: '%ACT%' });
    });

    it('routes type "number" through getSequelizeCondition (equals returns bare value)', () => {
        const result = buildWhereFromFilters(
            [{ key: 'qty', op: 'equals', value: '7' }],
            configs,
        ) as Record<string, unknown>;
        expect(result.quantity).toBe('7');
    });

    // SDN-1306 follow-up: numeric ID columns (Request ID, Property ID) need a 'contains' operator
    // for partial-digit search. MySQL accepts LIKE on INT via implicit CHAR cast.
    it('routes type "number" with op "contains" to a LIKE %value% clause', () => {
        const result = buildWhereFromFilters(
            [{ key: 'qty', op: 'contains', value: '12' }],
            configs,
        ) as Record<string, unknown>;
        expect(result.quantity).toEqual({ [Op.like]: '%12%' });
    });

    it('routes type "date" through getSequelizeDateCondition (returns Op.between range)', () => {
        const result = buildWhereFromFilters(
            [{ key: 'created', op: 'equals', value: '2026-01-15' }],
            configs,
        ) as Record<string, unknown>;
        const cond = result.createdAt as Record<symbol, unknown>;
        expect(cond[Op.between]).toBeDefined();
        const [startStr, endStr] = cond[Op.between] as [string, string];
        const start = new Date(startStr);
        const end = new Date(endStr);
        // Range spans ~24h regardless of local timezone (parseDateToRange uses local-day bounds, then ISO-serializes)
        const spanMs = end.getTime() - start.getTime();
        expect(spanMs).toBeGreaterThan(23 * 60 * 60 * 1000);
        expect(spanMs).toBeLessThan(25 * 60 * 60 * 1000);
    });

    it('routes type "timestamp" through getSequelizeTimestampCondition', () => {
        const result = buildWhereFromFilters(
            [{ key: 'releaseTs', op: 'isAfter', value: '2026-01-15' }],
            configs,
        ) as Record<string, unknown>;
        const cond = result.release_date as Record<symbol, unknown>;
        expect(typeof cond[Op.gt]).toBe('number');
    });

    // Date/timestamp columns have no empty-string state — isEmpty/isNotEmpty resolve to a plain NULL check.
    it('routes type "date" with op "isEmpty" to an IS NULL check', () => {
        const result = buildWhereFromFilters(
            [{ key: 'created', op: 'isEmpty', value: '' }],
            configs,
        ) as Record<string, unknown>;
        expect(result.createdAt).toEqual({ [Op.is]: null });
    });

    it('routes type "date" with op "isNotEmpty" to an IS NOT NULL check', () => {
        const result = buildWhereFromFilters(
            [{ key: 'created', op: 'isNotEmpty', value: '' }],
            configs,
        ) as Record<string, unknown>;
        expect(result.createdAt).toEqual({ [Op.not]: null });
    });

    it('routes type "timestamp" with op "isEmpty" to an IS NULL check', () => {
        const result = buildWhereFromFilters(
            [{ key: 'releaseTs', op: 'isEmpty', value: '' }],
            configs,
        ) as Record<string, unknown>;
        expect(result.release_date).toEqual({ [Op.is]: null });
    });

    it('non-valueless date ops still use getSequelizeDateCondition (regression for the valueless branch)', () => {
        const result = buildWhereFromFilters(
            [{ key: 'created', op: 'isBefore', value: '2026-01-15' }],
            configs,
        ) as Record<string, unknown>;
        const cond = result.createdAt as Record<symbol, unknown>;
        expect(cond[Op.lt]).toBeDefined();
    });

    // "doesNotEqual" on a Date column must exclude the entire day, not just a single timestamp.
    it('routes type "date" with op "doesNotEqual" through getSequelizeDateCondition (Op.or of day bounds)', () => {
        const result = buildWhereFromFilters(
            [{ key: 'created', op: 'doesNotEqual', value: '2026-01-15' }],
            configs,
        ) as Record<string, unknown>;
        const cond = result.createdAt as Record<symbol, unknown>;
        const branches = cond[Op.or] as Array<Record<symbol, unknown>>;
        expect(branches).toHaveLength(2);
        expect(branches[0][Op.lt]).toBeDefined();
        expect(branches[1][Op.gt]).toBeDefined();
    });

    it('routes type "date" with op "onOrBefore" / "onOrAfter" via getSequelizeDateCondition', () => {
        const onBefore = buildWhereFromFilters(
            [{ key: 'created', op: 'onOrBefore', value: '2026-01-15' }],
            configs,
        ) as Record<string, unknown>;
        const onAfter = buildWhereFromFilters(
            [{ key: 'created', op: 'onOrAfter', value: '2026-01-15' }],
            configs,
        ) as Record<string, unknown>;
        expect((onBefore.createdAt as Record<symbol, unknown>)[Op.lte]).toBeDefined();
        expect((onAfter.createdAt as Record<symbol, unknown>)[Op.gte]).toBeDefined();
    });

    it('routes type "string" without sequelize through plain getSequelizeCondition', () => {
        const result = buildWhereFromFilters(
            [{ key: 'name', op: 'contains', value: 'foo' }],
            configs,
        ) as Record<string, unknown>;
        expect(result['Property.name']).toEqual({ [Op.like]: '%foo%' });
    });

    it('routes type "string" with sequelize through case-insensitive LOWER(col) wrapping', () => {
        const lowerCol = { lowered: true };
        const wrapped = { wrapped: true };
        const sequelize = {
            fn: jest.fn((_fn: string, col: any) => ({ ...lowerCol, col })),
            col: jest.fn((c: string) => ({ colName: c })),
            where: jest.fn((lhs: any, rhs: any) => ({ ...wrapped, lhs, rhs })),
        };
        const result = buildWhereFromFilters(
            [{ key: 'name', op: 'contains', value: 'FOO' }],
            configs,
            sequelize as any,
        ) as Record<string, unknown>;
        expect(sequelize.fn).toHaveBeenCalledWith('LOWER', expect.any(Object));
        expect(sequelize.col).toHaveBeenCalledWith('Property.name');
        expect(sequelize.where).toHaveBeenCalled();
        // lowercased value reaches getSequelizeCondition: 'FOO' → 'foo'
        const rhs = sequelize.where.mock.calls[0][1];
        expect(rhs).toEqual({ [Op.like]: '%foo%' });
        expect(result).toMatchObject({ wrapped: true });
    });

    it('invokes function-typed column with the spec and uses the returned fragment', () => {
        const result = buildWhereFromFilters(
            [{ key: 'custom', op: 'equals', value: 'XYZ' }],
            configs,
        ) as Record<string, unknown>;
        expect(result).toEqual({ custom_col: { custom: 'XYZ' } });
    });

    it('mixes function-typed and standard configs across multiple filters', () => {
        const result = buildWhereFromFilters(
            [
                { key: 'status', op: 'equals', value: 'ACTIVE' },
                { key: 'custom', op: 'equals', value: 'XYZ' },
            ],
            configs,
        ) as Record<symbol, unknown>;
        const conditions = result[Op.and] as Record<string, unknown>[];
        expect(conditions).toHaveLength(2);
        expect(conditions[0]).toEqual({ status: 'ACTIVE' });
        expect(conditions[1]).toEqual({ custom_col: { custom: 'XYZ' } });
    });

    it('preserves filter order in the AND chain (deterministic for predictable SQL plans)', () => {
        const result = buildWhereFromFilters(
            [
                { key: 'qty', op: 'equals', value: '1' },
                { key: 'status', op: 'equals', value: 'A' },
                { key: 'status', op: 'equals', value: 'B' },
            ],
            configs,
        ) as Record<symbol, unknown>;
        const conditions = result[Op.and] as Record<string, unknown>[];
        expect(conditions[0]).toHaveProperty('quantity', '1');
        expect(conditions[1]).toHaveProperty('status', 'A');
        expect(conditions[2]).toHaveProperty('status', 'B');
    });
});

/**
 * Sanity check that the legacy single-filter primitives still behave as before — these are
 * exercised by every service via getSequelizeCondition. If they regress, every filter breaks.
 */
describe('filteringOperations — legacy getSequelizeCondition (regression guard)', () => {
    it('contains returns Op.like %value%', () => {
        expect(getSequelizeCondition('contains', 'foo')).toEqual({ [Op.like]: '%foo%' });
    });

    it('doesNotContain returns Op.notLike %value%', () => {
        expect(getSequelizeCondition('doesNotContain', 'foo')).toEqual({ [Op.notLike]: '%foo%' });
    });

    it('equals returns the bare value (Sequelize implicit eq)', () => {
        expect(getSequelizeCondition('equals', 'foo')).toBe('foo');
    });

    it('doesNotEqual returns Op.ne wrapper', () => {
        expect(getSequelizeCondition('doesNotEqual', 'foo')).toEqual({ [Op.ne]: 'foo' });
    });

    it('startsWith / endsWith pin the wildcard to the right side', () => {
        expect(getSequelizeCondition('startsWith', 'foo')).toEqual({ [Op.like]: 'foo%' });
        expect(getSequelizeCondition('endsWith', 'foo')).toEqual({ [Op.like]: '%foo' });
    });

    it('isAnyOf splits comma-separated value into Op.in array', () => {
        expect(getSequelizeCondition('isAnyOf', 'a,b,c')).toEqual({ [Op.in]: ['a', 'b', 'c'] });
    });

    it('unknown operator falls through to default contains semantics', () => {
        expect(getSequelizeCondition('totallyMadeUp', 'foo')).toEqual({ [Op.like]: '%foo%' });
    });

    it('numeric comparison operators (gt/gte/lt/lte) emit Op.gt / Op.gte / Op.lt / Op.lte', () => {
        expect(getSequelizeCondition('gt', '5')).toEqual({ [Op.gt]: '5' });
        expect(getSequelizeCondition('gte', '5')).toEqual({ [Op.gte]: '5' });
        expect(getSequelizeCondition('lt', '5')).toEqual({ [Op.lt]: '5' });
        expect(getSequelizeCondition('lte', '5')).toEqual({ [Op.lte]: '5' });
    });

    it('numeric comparison aliases (greaterThan/lessThan...) emit the same operators', () => {
        expect(getSequelizeCondition('greaterThan', '5')).toEqual({ [Op.gt]: '5' });
        expect(getSequelizeCondition('lessThan', '5')).toEqual({ [Op.lt]: '5' });
        expect(getSequelizeCondition('greaterThanOrEqual', '5')).toEqual({ [Op.gte]: '5' });
        expect(getSequelizeCondition('lessThanOrEqual', '5')).toEqual({ [Op.lte]: '5' });
    });

    it('isEmpty on a text column matches NULL or empty string', () => {
        expect(getSequelizeCondition('isEmpty', '')).toEqual({ [Op.or]: [{ [Op.is]: null }, { [Op.eq]: '' }] });
    });

    it('isNotEmpty on a text column requires non-null AND non-empty', () => {
        expect(getSequelizeCondition('isNotEmpty', '')).toEqual({ [Op.and]: [{ [Op.not]: null }, { [Op.ne]: '' }] });
    });
});

/**
 * SDN-1400: filter operators must adapt to the column data type.
 * isEmpty/isNotEmpty used to be value-less (dropped before reaching SQL) and text-shaped (wrong on numbers/dates);
 * isAnyOf had no branch on date/timestamp columns. These scenarios pin the corrected behavior per column type.
 */
describe('filteringOperations — SDN-1400 type-aware operators', () => {
    describe('isValuelessOperator', () => {
        it('is true for isEmpty / isNotEmpty', () => {
            expect(isValuelessOperator('isEmpty')).toBe(true);
            expect(isValuelessOperator('isNotEmpty')).toBe(true);
        });

        it('is false for value-bearing operators', () => {
            ['equals', 'contains', 'isAnyOf', 'gt', 'startsWith', 'doesNotEqual'].forEach((op) => {
                expect(isValuelessOperator(op)).toBe(false);
            });
        });
    });

    describe('isEmpty / isNotEmpty respect the column type', () => {
        it('text column: empty means NULL or empty string', () => {
            expect(getSequelizeCondition('isEmpty', '', 'string')).toEqual({ [Op.or]: [{ [Op.is]: null }, { [Op.eq]: '' }] });
            expect(getSequelizeCondition('isNotEmpty', '', 'string')).toEqual({ [Op.and]: [{ [Op.not]: null }, { [Op.ne]: '' }] });
        });

        it('number column: empty is NULL only — never matches 0 via empty-string coercion', () => {
            expect(getSequelizeCondition('isEmpty', '', 'number')).toEqual({ [Op.is]: null });
            expect(getSequelizeCondition('isNotEmpty', '', 'number')).toEqual({ [Op.not]: null });
        });

        it('date column: isEmpty / isNotEmpty resolve to a plain NULL check', () => {
            expect(getSequelizeDateCondition('isEmpty', '')).toEqual({ [Op.is]: null });
            expect(getSequelizeDateCondition('isNotEmpty', '')).toEqual({ [Op.not]: null });
        });

        it('timestamp column: isEmpty / isNotEmpty resolve to a plain NULL check', () => {
            expect(getSequelizeTimestampCondition('isEmpty', '')).toEqual({ [Op.is]: null });
            expect(getSequelizeTimestampCondition('isNotEmpty', '')).toEqual({ [Op.not]: null });
        });
    });

    describe('isAnyOf across column types', () => {
        it('text / number column: splits the comma list into an IN clause', () => {
            expect(getSequelizeCondition('isAnyOf', 'a,b,c')).toEqual({ [Op.in]: ['a', 'b', 'c'] });
        });

        it('date column: builds an OR of per-day ranges instead of falling through to a single bogus range', () => {
            const cond = getSequelizeDateCondition('isAnyOf', '2026-01-15,2026-02-20') as Record<symbol, unknown>;
            const branches = cond[Op.or] as Array<Record<symbol, unknown>>;
            expect(branches).toHaveLength(2);
            branches.forEach((b) => expect(b[Op.between]).toBeDefined());
        });

        it('timestamp column: builds an OR of per-day ms ranges', () => {
            const cond = getSequelizeTimestampCondition('isAnyOf', '2026-01-15,2026-02-20') as Record<symbol, unknown>;
            const branches = cond[Op.or] as Array<Record<symbol, unknown>>;
            expect(branches).toHaveLength(2);
            const [from, to] = branches[0][Op.between] as [number, number];
            expect(typeof from).toBe('number');
            expect(typeof to).toBe('number');
        });

        it('date column: an unparseable list matches no row instead of throwing or matching all', () => {
            expect(getSequelizeDateCondition('isAnyOf', 'not-a-date')).toEqual({ [Op.in]: [] });
        });
    });

    describe('getSequelizeCaseInsensitiveCondition', () => {
        const sequelize = {
            fn: jest.fn((fn: string, col: unknown) => ({ fn, col })),
            col: jest.fn((c: string) => ({ col: c })),
            where: jest.fn((lhs: unknown, rhs: unknown) => ({ lhs, rhs })),
        } as any;

        beforeEach(() => {
            sequelize.fn.mockClear();
            sequelize.col.mockClear();
            sequelize.where.mockClear();
        });

        it('value-bearing operator wraps the column in LOWER() for case-insensitive matching', () => {
            getSequelizeCaseInsensitiveCondition(sequelize, 'property_status', 'contains', 'Active');
            expect(sequelize.fn).toHaveBeenCalledWith('LOWER', expect.anything());
            expect(sequelize.where).toHaveBeenCalled();
        });

        it('isEmpty returns a plain column condition with no LOWER() wrap (NULL checks are not case-sensitive)', () => {
            const result = getSequelizeCaseInsensitiveCondition(sequelize, 'property_status', 'isEmpty', '');
            expect(sequelize.where).not.toHaveBeenCalled();
            expect(result).toEqual({ [Op.or]: [{ [Op.is]: null }, { [Op.eq]: '' }] });
        });

        it('isNotEmpty returns a plain column condition with no LOWER() wrap', () => {
            const result = getSequelizeCaseInsensitiveCondition(sequelize, 'property_status', 'isNotEmpty', '');
            expect(sequelize.where).not.toHaveBeenCalled();
            expect(result).toEqual({ [Op.and]: [{ [Op.not]: null }, { [Op.ne]: '' }] });
        });

        it('isAnyOf lowercases each value and compares against LOWER(col)', () => {
            getSequelizeCaseInsensitiveCondition(sequelize, 'property_status', 'isAnyOf', 'Allocated,DENIED');
            expect(sequelize.where).toHaveBeenCalled();
            expect(sequelize.where.mock.calls[0][1]).toEqual({ [Op.in]: ['allocated', 'denied'] });
        });

        it('passes a nested association path to sequelize.col verbatim', () => {
            getSequelizeCaseInsensitiveCondition(sequelize, 'request.doneeAccount.organization.name', 'contains', 'Acme');
            expect(sequelize.col).toHaveBeenCalledWith('request.doneeAccount.organization.name');
        });
    });

    describe('shouldApplyFilter — the guard that decides whether a filter runs', () => {
        it('keeps a value-less operator regardless of the value (empty, missing, or stray)', () => {
            expect(shouldApplyFilter('isEmpty', '')).toBe(true);
            expect(shouldApplyFilter('isEmpty', undefined)).toBe(true);
            expect(shouldApplyFilter('isNotEmpty', undefined)).toBe(true);
            expect(shouldApplyFilter('isNotEmpty', 'stray')).toBe(true);
        });

        it('drops a value-bearing operator when the value is empty or missing', () => {
            expect(shouldApplyFilter('contains', '')).toBe(false);
            expect(shouldApplyFilter('contains', undefined)).toBe(false);
            expect(shouldApplyFilter('equals', '')).toBe(false);
            expect(shouldApplyFilter('isAnyOf', undefined)).toBe(false);
        });

        it('keeps a value-bearing operator when the value is present', () => {
            expect(shouldApplyFilter('contains', 'x')).toBe(true);
            expect(shouldApplyFilter('equals', '0')).toBe(true);
        });
    });

    describe('isAnyOf edge cases', () => {
        it('treats a single value as a one-element IN list', () => {
            expect(getSequelizeCondition('isAnyOf', 'solo')).toEqual({ [Op.in]: ['solo'] });
        });

        it('column type does not change the IN clause', () => {
            expect(getSequelizeCondition('isAnyOf', '1,2,3', 'number')).toEqual({ [Op.in]: ['1', '2', '3'] });
        });

        it('date column: skips unparseable entries and keeps the valid ones', () => {
            const cond = getSequelizeDateCondition('isAnyOf', '2026-01-15,garbage,2026-02-20') as Record<symbol, unknown>;
            expect(cond[Op.or] as unknown[]).toHaveLength(2);
        });

        it('timestamp column: an all-unparseable list matches no row', () => {
            expect(getSequelizeTimestampCondition('isAnyOf', 'not-a-date')).toEqual({ [Op.in]: [] });
        });

        it('date / timestamp column: an empty value matches no row', () => {
            expect(getSequelizeDateCondition('isAnyOf', '')).toEqual({ [Op.in]: [] });
            expect(getSequelizeTimestampCondition('isAnyOf', '')).toEqual({ [Op.in]: [] });
        });
    });

    describe('value-less operators ignore any value that slips through', () => {
        it('getSequelizeCondition isEmpty / isNotEmpty ignore a non-empty value', () => {
            expect(getSequelizeCondition('isEmpty', 'junk', 'number')).toEqual({ [Op.is]: null });
            expect(getSequelizeCondition('isNotEmpty', 'junk', 'string')).toEqual({ [Op.and]: [{ [Op.not]: null }, { [Op.ne]: '' }] });
        });

        it('date / timestamp helpers ignore a non-empty value for isEmpty / isNotEmpty', () => {
            expect(getSequelizeDateCondition('isEmpty', '2026-01-15')).toEqual({ [Op.is]: null });
            expect(getSequelizeTimestampCondition('isNotEmpty', '2026-01-15')).toEqual({ [Op.not]: null });
        });
    });

    describe('filtersFromLegacy keeps value-less operators', () => {
        it('keeps isEmpty / isNotEmpty even though the legacy filterValue is empty or missing', () => {
            expect(filtersFromLegacy('property_name', 'isEmpty', '')).toEqual([
                { key: 'property_name', op: 'isEmpty', value: '' },
            ]);
            expect(filtersFromLegacy('property_name', 'isNotEmpty', undefined)).toEqual([
                { key: 'property_name', op: 'isNotEmpty', value: '' },
            ]);
        });

        it('forces the value to "" for a value-less operator even if a stray filterValue was sent', () => {
            expect(filtersFromLegacy('property_name', 'isEmpty', 'stray')).toEqual([
                { key: 'property_name', op: 'isEmpty', value: '' },
            ]);
        });
    });

    describe('buildWhereFromFilters — type-aware routing end-to-end', () => {
        const configs: FilterColumnConfig[] = [
            { key: 'created', column: 'createdAt', type: 'date' },
            { key: 'qty', column: 'quantity', type: 'number' },
            { key: 'status', column: 'status', type: 'enum' },
        ];

        it('isAnyOf on a date column routes into an OR of day ranges', () => {
            const result = buildWhereFromFilters(
                [{ key: 'created', op: 'isAnyOf', value: '2026-01-15,2026-02-20' }],
                configs,
            ) as Record<string, unknown>;
            const cond = result.createdAt as Record<symbol, unknown>;
            expect(cond[Op.or] as unknown[]).toHaveLength(2);
        });

        it('isEmpty on a number column resolves to IS NULL only', () => {
            const result = buildWhereFromFilters(
                [{ key: 'qty', op: 'isEmpty', value: '' }],
                configs,
            ) as Record<string, unknown>;
            expect(result.quantity).toEqual({ [Op.is]: null });
        });

        it('isEmpty on an enum column resolves to IS NULL only', () => {
            const result = buildWhereFromFilters(
                [{ key: 'status', op: 'isEmpty', value: '' }],
                configs,
            ) as Record<string, unknown>;
            expect(result.status).toEqual({ [Op.is]: null });
        });

        it('isEmpty on a string column with sequelize stays keyed by column and skips the LOWER() wrap', () => {
            const sequelize = { fn: jest.fn(), col: jest.fn(), where: jest.fn() } as any;
            const result = buildWhereFromFilters(
                [{ key: 'name', op: 'isEmpty', value: '' }],
                [{ key: 'name', column: 'Property.name', type: 'string' }],
                sequelize,
            ) as Record<string, unknown>;
            expect(sequelize.where).not.toHaveBeenCalled();
            expect(result['Property.name']).toEqual({ [Op.or]: [{ [Op.is]: null }, { [Op.eq]: '' }] });
        });
    });
});
