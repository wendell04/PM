/**
 * A POST that timed out is an UNKNOWN, not a failure.
 *
 * fetchWithTimeout aborts at the client after N ms. The server does not know that: it finishes
 * the work and answers into a closed socket. The screen then shows a red error while the thing
 * has in fact happened - the shop saw "Request timed out after 15000ms" and "Under Review" on a
 * design the customer had already been told was approved.
 *
 * So after a timeout on a write, never report failure. Re-read the record and let the server
 * say what is true.
 */

export function isTimeoutError(err) {
  const m = String(err?.message ?? err ?? '');
  return /timed out after/i.test(m) || err?.name === 'AbortError';
}

/** A dropped connection is the same unknown: the request may or may not have landed. */
export function isNetworkError(err) {
  const m = String(err?.message ?? err ?? '');
  return isTimeoutError(err) || /failed to fetch|network ?error|load failed/i.test(m);
}

/**
 * Settle a write whose response never arrived.
 *
 * @param {Function} reread   () => Promise<record|null> - fetch the record fresh from the server
 * @param {Function} didLand  (record) => boolean        - true when the write is visible on it
 * @returns {Promise<{ landed: boolean, record: any, message: string }>}
 *
 * `landed` false only means the server does not show the change yet - the caller may retry.
 * When the re-read itself fails, landed is false and the message says the state is unknown,
 * which is the one thing the old code never said.
 */
export async function settleAfterTimeout(reread, didLand, label = 'The change') {
  try {
    const record = await reread();
    if (record && didLand(record)) {
      return { landed: true, record, message: `${label} went through - the connection was just slow.` };
    }
    return { landed: false, record, message: `${label} did not go through. Nothing was saved - try again.` };
  } catch {
    return { landed: false, record: null, message: `The request took too long and we could not check the result. Reload the page before trying again.` };
  }
}
