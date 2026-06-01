import {
  AllocationsExportService,
  csvEscapeCell,
  formatAllocatedDate,
  getCalendarMonthRangeMs,
} from '@/reports/services/allocations-export.service';

describe('getCalendarMonthRangeMs', () => {
  it('covers all of April 2026 in local calendar time', () => {
    const { rangeStart, rangeEndExclusive } = getCalendarMonthRangeMs(2026, 4);
    expect(rangeStart).toBe(new Date(2026, 3, 1, 0, 0, 0, 0).getTime());
    expect(rangeEndExclusive).toBe(new Date(2026, 4, 1, 0, 0, 0, 0).getTime());
    expect(new Date(rangeStart).getMonth()).toBe(3);
    expect(new Date(rangeEndExclusive - 1).getMonth()).toBe(3);
    expect(new Date(rangeEndExclusive - 1).getDate()).toBe(30);
  });

  it('includes the last moment of the last day of the month', () => {
    const { rangeStart, rangeEndExclusive } = getCalendarMonthRangeMs(2026, 4);
    const lastMomentApril = new Date(2026, 3, 30, 23, 59, 59, 999).getTime();
    expect(lastMomentApril).toBeGreaterThanOrEqual(rangeStart);
    expect(lastMomentApril).toBeLessThan(rangeEndExclusive);
  });

  it('includes an allocation timestamp from today when today is in the selected month', () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const { rangeStart, rangeEndExclusive } = getCalendarMonthRangeMs(year, month);
    const todayMs = now.getTime();
    expect(todayMs).toBeGreaterThanOrEqual(rangeStart);
    expect(todayMs).toBeLessThan(rangeEndExclusive);
  });
});

describe('formatAllocatedDate', () => {
  it('returns MM/DD/YYYY in local time', () => {
    const ms = new Date(2026, 3, 15, 12, 0, 0, 0).getTime();
    expect(formatAllocatedDate(ms)).toBe('04/15/2026');
  });
});

describe('csvEscapeCell', () => {
  it('wraps fields with comma or quote', () => {
    expect(csvEscapeCell('a,b')).toBe('"a,b"');
    expect(csvEscapeCell('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('AllocationsExportService.buildCsvFromRows', () => {
  it('writes readable headers and Total OAC column', () => {
    const csv = AllocationsExportService.buildCsvFromRows([
      {
        property_control_number: 'ICN-1',
        tcn: 'TX-26-000001',
        property_name: 'Widget',
        property_allocated_quantity: 2,
        organization_name: 'Acme, Inc.',
        property_allocated_date: new Date(2026, 3, 10, 0, 0, 0, 0).getTime(),
        property_original_value: '10.50',
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'ICN,TCN,PROPERTYNAME,ALLOCATED QUANTITY,ORGANIZATION NAME,ALLOCATED DATE,ORIGINAL VALUE,Total OAC'
    );
    expect(lines[1]).toContain('ICN-1');
    expect(lines[1]).toContain('"Acme, Inc."');
    expect(lines[1]).toContain('04/10/2026');
    expect(lines[1]).toContain('21.00');
  });
});
