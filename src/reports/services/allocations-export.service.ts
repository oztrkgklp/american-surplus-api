import { TimeFormat } from '@/enums/timeFormat';
import { database } from '@/utils/database';
import { convertUnixTime } from '@/utils/timeHelper';
import { QueryTypes } from 'sequelize';

export type MonthlyAllocationRow = {
  property_control_number: string;
  tcn: string | null;
  property_name: string;
  property_allocated_quantity: number;
  organization_name: string;
  property_allocated_date: number;
  property_original_value: string | number;
};

/**
 * Local-calendar month bounds (1–12) as millisecond timestamps.
 * Uses [rangeStart, rangeEndExclusive) so every moment on the last day of the month is included.
 */
export function getCalendarMonthRangeMs(
  year: number,
  month: number
): { rangeStart: number; rangeEndExclusive: number } {
  const monthIndex = month - 1;
  const rangeStart = new Date(year, monthIndex, 1, 0, 0, 0, 0).getTime();
  const rangeEndExclusive = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0).getTime();
  return { rangeStart, rangeEndExclusive };
}

/** @deprecated Use getCalendarMonthRangeMs */
export const getUtcMonthRangeMs = getCalendarMonthRangeMs;

export function formatAllocatedDate(ms: number): string {
  return convertUnixTime(ms, TimeFormat.MM_DD_YYYY);
}

export function csvEscapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export class AllocationsExportService {
  /**
   * Line-level allocations for properties allocated in the given calendar month for donee accounts in the state.
   */
  static async fetchMonthlyAllocationRows(
    stateId: number,
    year: number,
    month: number
  ): Promise<MonthlyAllocationRow[]> {
    const { rangeStart, rangeEndExclusive } = getCalendarMonthRangeMs(year, month);
    const rows = (await database.sequelize!.query(
      `
      SELECT
        p.property_control_number,
        r.tcn,
        p.property_name,
        p.property_allocated_quantity,
        o.name AS organization_name,
        p.property_allocated_date,
        p.property_original_value
      FROM properties p
      INNER JOIN requests r ON r.id = p.request_id
      INNER JOIN donee_accounts da ON da.id = r.donee_account
      INNER JOIN organizations o ON o.id = da.organizationId
      WHERE da.stateId = :stateId
        AND p.property_allocated_quantity > 0
        AND p.property_allocated_date IS NOT NULL
        AND p.property_allocated_date >= :rangeStart
        AND p.property_allocated_date < :rangeEndExclusive
        AND p.is_cancelled = false
        AND p.is_denied = false
      ORDER BY p.property_allocated_date ASC, p.property_id ASC
      `,
      {
        replacements: { stateId, rangeStart, rangeEndExclusive },
        type: QueryTypes.SELECT,
      }
    )) as MonthlyAllocationRow[];
    return rows;
  }

  static buildCsvFromRows(rows: MonthlyAllocationRow[]): string {
    const headers = [
      'ICN',
      'TCN',
      'PROPERTYNAME',
      'ALLOCATED QUANTITY',
      'ORGANIZATION NAME',
      'ALLOCATED DATE',
      'ORIGINAL VALUE',
      'Total OAC',
    ];
    const lines: string[] = [headers.join(',')];

    for (const row of rows) {
      const qty = Number(row.property_allocated_quantity);
      const original = Number(row.property_original_value);
      const totalOac = (qty * original).toFixed(2);
      const allocatedDate = formatAllocatedDate(Number(row.property_allocated_date));
      lines.push(
        [
          csvEscapeCell(row.property_control_number),
          csvEscapeCell(row.tcn ?? ''),
          csvEscapeCell(row.property_name),
          csvEscapeCell(qty),
          csvEscapeCell(row.organization_name),
          csvEscapeCell(allocatedDate),
          csvEscapeCell(original.toFixed(2)),
          csvEscapeCell(totalOac),
        ].join(',')
      );
    }

    return lines.join('\n');
  }

  static async buildMonthlyAllocationsCsv(stateId: number, year: number, month: number): Promise<string> {
    const rows = await this.fetchMonthlyAllocationRows(stateId, year, month);
    return this.buildCsvFromRows(rows);
  }
}
