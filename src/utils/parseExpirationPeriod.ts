/**
 * Parses a duration string (e.g., "4h", "30m", "60s") and returns the value and unit for moment.js
 */
export const parseDuration = (duration: string): { value: number; unit: moment.unitOfTime.DurationConstructor } => {
  const match = duration.match(/^(\d+)([smhdwy])$/i);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const unitMap: Record<string, moment.unitOfTime.DurationConstructor> = {
    s: 'seconds',
    m: 'minutes',
    h: 'hours',
    d: 'days',
    w: 'weeks',
    y: 'years',
  };

  return { value, unit: unitMap[unit] };
};