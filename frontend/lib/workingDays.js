/**
 * Working days, matching the server exactly.
 *
 * Three screens counted business days by skipping Sundays and nothing else, while the server
 * skips Sundays, national holidays and whatever else the shop has closed. That disagreement is
 * worse than either rule on its own: checkout would print one date and the saved order would hold
 * another, and the customer would be told the earlier one.
 *
 * This mirrors backend/app/Support/WorkingDays.php. The fixed list lives in both because it is
 * stable; the moving holidays and the shop's own closures travel with the settings payload, so
 * only the dates that actually change have one home.
 */

/** Regular Philippine holidays on the same date every year. The rest are shop settings. */
const FIXED = [
  '01-01', // New Year's Day
  '04-09', // Araw ng Kagitingan
  '05-01', // Labor Day
  '06-12', // Independence Day
  '08-21', // Ninoy Aquino Day
  '11-01', // All Saints' Day
  '11-30', // Bonifacio Day
  '12-25', // Christmas Day
  '12-30', // Rizal Day
  '12-31', // New Year's Eve
];

const DEFAULT_OPEN = [1, 2, 3, 4, 5, 6];   // closed Sunday, open Monday to Saturday

const pad = (n) => String(n).padStart(2, '0');
const mmdd = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymd  = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * @param {Date} d
 * @param {{workingDays?: number[], holidays?: string[]}} settings
 */
export function isWorkingDay(d, settings = {}) {
  const open = Array.isArray(settings.workingDays) && settings.workingDays.length
    ? settings.workingDays
    : DEFAULT_OPEN;
  if (!open.includes(d.getDay())) return false;
  if (FIXED.includes(mmdd(d))) return false;
  const extra = Array.isArray(settings.holidays) ? settings.holidays : [];
  return !extra.some(h => String(h).slice(0, 10) === ymd(d));
}

/** N working days after `from` (today by default). Never counts the starting day itself. */
export function addWorkingDays(n, settings = {}, from = null) {
  const d = from ? new Date(from) : new Date();
  d.setHours(0, 0, 0, 0);
  let left = Math.max(0, Number(n) || 0);
  let guard = 0;
  while (left > 0 && guard < 400) {
    d.setDate(d.getDate() + 1);
    guard++;
    if (isWorkingDay(d, settings)) left--;
  }
  return d;
}

/** N working days before `from` - scheduling a job backwards from its delivery date. */
export function subtractWorkingDays(n, settings = {}, from = null) {
  const d = from ? new Date(from) : new Date();
  let left = Math.max(0, Number(n) || 0);
  let guard = 0;
  while (left > 0 && guard < 400) {
    d.setDate(d.getDate() - 1);
    guard++;
    if (isWorkingDay(d, settings)) left--;
  }
  return d;
}
