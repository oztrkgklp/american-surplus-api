import { TimeFormat } from "@/enums/timeFormat";

export const convertUnixTime = (unixTime: number, format: TimeFormat) => {
    const date = new Date(unixTime);

    switch (format) {
        case TimeFormat.MM_DD_YYYY:
            return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;

        case TimeFormat.DD_MM_YYYY:
            return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;

        case TimeFormat.YYYY_MM_DD:
            return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;

        default:
            throw new Error('Unsupported date format');
    }

}

export const calculateDayDifference = (unixTime: number): number => {
    const today = new Date();
    const targetDate = new Date(unixTime);

    const differenceInTime = today.getTime() - targetDate.getTime();
    return Math.floor(differenceInTime / (1000 * 60 * 60 * 24));
};

//31 jan + 1 month can give you some day in march to prevent this I added this logic use it when you need 
export const addMonthsSafe = (date: Date, months: number): Date => {
    const d = new Date(date.getTime());
    const origDay = d.getDate();
    d.setMonth(d.getMonth() + months);
    if (d.getDate() < origDay) {
        // moved past end of month, clamp to last day
        d.setDate(0);
    }
    return d;
}

/**
 * Normalize date to MM/DD/YYYY format (matching Elasticsearch storage format for string fields)
 * Handles both MM/DD/YYYY and ISO 8601 (YYYY-MM-DD) formats
 * @param dateString - Date string in various formats
 * @returns Date string in MM/DD/YYYY format
 */
export const formatDateForElasticsearch = (dateString: string): string => {
  // Check if already in MM/DD/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}/.test(dateString)) {
    return dateString;
  }
  // Check if in ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    const [year, month, day] = dateString.split('-');
    return `${month}/${day}/${year}`;
  }
  // Try to parse as Date and format to MM/DD/YYYY
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }
  // Return as-is if can't parse
  return dateString;
};

/**
 * Convert date to ISO 8601 format (YYYY-MM-DD) for Elasticsearch date field queries
 * Elasticsearch date fields expect ISO 8601 format in range queries, even if stored as MM/DD/YYYY
 * Handles both MM/DD/YYYY and ISO 8601 (YYYY-MM-DD) formats
 * @param dateString - Date string in various formats
 * @returns Date string in ISO 8601 format (YYYY-MM-DD)
 */
export const formatDateForElasticsearchDateField = (dateString: string): string => {
  // Check if already in ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    return dateString;
  }
  // Check if in MM/DD/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}/.test(dateString)) {
    const [month, day, year] = dateString.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // Try to parse as Date and format to ISO 8601
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  // Return as-is if can't parse
  return dateString;
};