/**
 * Calendar dates on the shop's clock, not the browser's and not UTC.
 *
 * The dashboard used to bucket sales with `new Date(d).toISOString().split("T")[0]`,
 * which is the UTC day. The backend buckets with Carbon under
 * `'timezone' => 'Asia/Manila'`, which is the local day. Almost every sale in the
 * database is stored at 16:00 UTC - exactly Manila midnight - so the two disagreed
 * on 92% of rows: 349 of 379 landed on a different day, 58 in a different week
 * bucket and 5 in a different month. The series the page drew and the series the
 * nightly job stored were not the same series.
 *
 * The shop's own day is the right one, so these follow the backend.
 *
 * NOT the same job as lib/localDate.js, which dates things on the VIEWER's clock.
 * That is right for a UI affordance - a date box capped at "today" should mean the
 * user's today. It is wrong here: a viewer in another timezone would bucket sales
 * differently from the nightly job, which is the divergence this file exists to close.
 * Use todayLocal() for what the user sees; use these for anything the backend also counts.
 */
export const BUSINESS_TZ = "Asia/Manila";

// en-CA formats as YYYY-MM-DD, which is what every caller wants and what sorts
// correctly as a string.
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The shop-local calendar date of an instant, as "YYYY-MM-DD".
 * Returns null for anything unparseable, so callers can skip the row rather
 * than bucket it under "Invalid Date".
 */
export function businessDate(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return fmt.format(d);
}

/** Today, on the shop's clock. Between midnight and 08:00 local this differs
 *  from the UTC date, which is why the "Today" marker used to sit a day back. */
export function businessToday() {
  return fmt.format(new Date());
}
