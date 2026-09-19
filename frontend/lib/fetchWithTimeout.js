// The Authorization value this request actually carried, or '' when it carried none.
function authHeaderValue(headers) {
  if (!headers) return '';
  try {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      return headers.get('Authorization') ?? '';
    }
    const key = Object.keys(headers).find((k) => k.toLowerCase() === 'authorization');
    return key ? String(headers[key] ?? '') : '';
  } catch {
    return '';
  }
}

// A REAL bearer token, not the string "Bearer null". A component that mounts before the token
// is read from storage sends exactly that, the server answers 401, and treating that 401 as an
// expired session logged the person out seconds after they signed in. Their token was still
// valid for a day; nothing was wrong but the order of two renders.
function carriesRealToken(headers) {
  const v = authHeaderValue(headers).trim();
  if (!v) return false;
  const token = v.replace(/^Bearer\s+/i, '').trim();
  return token !== '' && token !== 'null' && token !== 'undefined';
}

// Paths whose 401 is the answer to a question, not a dead session: signing in, verifying a
// code, checking a device. Logging out on those makes the sign-in page log you out.
const AUTH_ENDPOINTS = /\/api\/(login|register|verify-email|resend-code|forgot-password|reset-password|2fa\/)/i;

// The session is only declared dead when the server confirms it on the one endpoint whose whole
// job is to answer "is this token still good?". A single 401 from any other endpoint - a proxy
// hiccup, a rate limit, a race - is not evidence, and acting on it wipes a live session.
async function tokenIsStillValid(url, token) {
  try {
    const base = String(url).split('/api/')[0];
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${base}/api/user`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      return res.status !== 401;
    } finally {
      clearTimeout(id);
    }
  } catch {
    // Network failure proves nothing about the token. Keep the session.
    return true;
  }
}

// Centralized session-expiry handling: clear the cached session and bounce to the
// landing page. Called when an authenticated request comes back 401 so every page
// reacts consistently instead of silently showing a load error.
let sessionExpiredHandled = false;
function handleSessionExpired() {
  if (typeof window === 'undefined' || sessionExpiredHandled) return;
  sessionExpiredHandled = true;
  try {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_expires_at');
    localStorage.removeItem('auth_validated_at');
    localStorage.removeItem('auth_checked_at');
    sessionStorage.setItem('sessionExpired', 'true');
    try {
      const bc = new BroadcastChannel('pmp_auth');
      bc.postMessage({ type: 'AUTH_LOGOUT' });
      bc.close();
    } catch { /* BroadcastChannel unsupported */ }
  } catch { /* storage unavailable */ }
  if (window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

export async function fetchWithTimeout(
  url,
  options = {},
  timeout = 30000,
  retries = 1
) {
  const attempt = async () => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const headers = {
        ...(options.headers || {}),
      };
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(id);
    }
  };

  // Only a read may be repeated. A POST that timed out may still have gone through on the server,
  // and sending it again charges a card twice or places an order twice - which is exactly how a
  // one-click deposit became a deposit plus the balance.
  const method = String(options.method || 'GET').toUpperCase();
  const maxRetries = method === 'GET' || method === 'HEAD' ? retries : 0;

  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await attempt();
      // Expired/invalid session, but only once the server has confirmed it on /api/user.
      if (response.status === 401 && carriesRealToken(options.headers) && !AUTH_ENDPOINTS.test(String(url))) {
        const token = authHeaderValue(options.headers).replace(/^Bearer\s+/i, '').trim();
        if (!(await tokenIsStillValid(url, token))) handleSessionExpired();
        return response;
      }
      // Never retry successful responses or client errors (4xx) - only network/server failures
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      // 5xx - treat as retryable
      lastError = new Error(`Server error: ${response.status}`);
      lastError.response = response;
      if (i === maxRetries) return response; // return the last 5xx so callers can read the body
    } catch (err) {
      lastError = err;
    }
    if (i < maxRetries) {
      // Exponential backoff: 500ms, 1000ms, 2000ms…
      await new Promise(res => setTimeout(res, 500 * Math.pow(2, i)));
    }
  }
  throw lastError;
}
