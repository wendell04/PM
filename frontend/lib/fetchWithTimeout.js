/**
 * Fetch with timeout support
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default: 30000)
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const isNgrok = typeof url === 'string' && url.includes('ngrok');
    const headers = isNgrok
      ? { 'ngrok-skip-browser-warning': '1', ...(options.headers || {}) }
      : options.headers;
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`Request timeout after ${timeout}ms for ${url}`);
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
}
