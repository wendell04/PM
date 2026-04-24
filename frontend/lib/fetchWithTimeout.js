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
        'ngrok-skip-browser-warning': '1',
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
  console.warn(`Request failed after ${retries + 1} attempts: ${url}`);
  throw lastError;
}
