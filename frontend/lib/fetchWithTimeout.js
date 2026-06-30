// Returns true if the request carries a Bearer/Authorization header, i.e. it is
// an authenticated call whose 401 means an expired/invalid session.
function hasAuthHeader(headers) {
  if (!headers) return false;
  try {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      return headers.has('Authorization');
    }
    return Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
  } catch {
    return false;
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

  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await attempt();
      // Expired/invalid session on an authenticated request: log out + redirect.
      if (response.status === 401 && hasAuthHeader(options.headers)) {
        handleSessionExpired();
        return response;
      }
      // Never retry successful responses or client errors (4xx) — only network/server failures
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      // 5xx — treat as retryable
      lastError = new Error(`Server error: ${response.status}`);
      lastError.response = response;
      if (i === retries) return response; // return the last 5xx so callers can read the body
    } catch (err) {
      lastError = err;
    }
    if (i < retries) {
      // Exponential backoff: 500ms, 1000ms, 2000ms…
      await new Promise(res => setTimeout(res, 500 * Math.pow(2, i)));
    }
  }
  throw lastError;
}
