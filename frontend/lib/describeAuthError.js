/**
 * Turn a thrown sign-in / register / reset error into something the reader can act on.
 *
 * Every one of these forms used to print "Network error. Make sure the backend
 * server is running." for anything that reached their catch. That sentence is a
 * guess, and it was wrong in the case that actually happens most: the dev server
 * had fallen back to port 3001 because 3000 was taken, so the page was on :3001
 * while NEXT_PUBLIC_API_URL still pointed at :3000. The browser refused the
 * cross-origin call, the form said the backend was down, and the backend was up
 * the whole time - answering on the very port the message named.
 *
 * fetch() reports a blocked request, a refused connection and a dead host
 * identically, so the advice has to come from what we can still check: whether
 * the page and the API are on the same origin.
 */
export function describeAuthError(err, apiUrl) {
  // fetchWithTimeout converts an abort into this, so it arrives as a plain Error.
  if (err?.name === 'AbortError' || /timed out after/i.test(err?.message ?? '')) {
    return 'The server did not answer in time. It may be starting up - wait a moment and try again.';
  }

  const isNetwork =
    err instanceof TypeError ||
    /failed to fetch|networkerror|load failed/i.test(err?.message ?? '');

  if (!isNetwork) {
    // A real error from our own code (a missing field, a parse failure). Its own
    // message is more useful than anything we would invent here.
    return err?.message || 'Something went wrong. Please try again.';
  }

  let apiOrigin = '';
  try { apiOrigin = new URL(apiUrl, window.location.href).origin; } catch { /* malformed */ }
  const pageOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  // The mismatch case: same host, different port is the one people hit, because
  // a dev server that finds its port taken moves to the next one without saying
  // much about it.
  if (apiOrigin && pageOrigin && apiOrigin !== pageOrigin) {
    return `This page is running on ${pageOrigin} but it is calling the API at ${apiOrigin}. ` +
      `The browser blocks that unless ${pageOrigin} is on the API's allowed list. ` +
      `If the app is meant to be on ${apiOrigin}, another process is probably holding that port.`;
  }

  return `Could not reach the server at ${apiOrigin || apiUrl}. ` +
    `Either it is not running, or it refused the request.`;
}
