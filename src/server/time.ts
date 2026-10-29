// Day boundaries in the restaurant's timezone (the Express server ran with TZ=Asia/Kolkata).

// Offset (ms) of `timeZone` from UTC at the given instant.
function tzOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

// The UTC instant of local midnight on y-m-d in `timeZone`.
export function zonedMidnight(y: number, m: number, d: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  let ts = guess - tzOffset(guess, timeZone);
  ts = guess - tzOffset(ts, timeZone); // second pass settles DST transitions
  return new Date(ts);
}

// Today's (or the given date's) local calendar date in `timeZone`.
export function zonedToday(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

// [start, end) of a local calendar day.
export function zonedDayRange(y: number, m: number, d: number, timeZone: string) {
  const start = zonedMidnight(y, m, d, timeZone);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone);
  return { start, end };
}

// Parses "2026-10-27" into its parts; null when it isn't a real date.
export function parseDateParam(value: string | null) {
  const [y, m, d] = String(value || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}
