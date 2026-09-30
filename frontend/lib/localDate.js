// Today as YYYY-MM-DD on the viewer's own clock. toISOString() is UTC, which in the Philippines
// (UTC+8) is still yesterday until 8 AM: a delivery received at 2 AM got dated the day before,
// and a date box capped at "today" would not let anyone pick the real today.
export function todayLocal(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
