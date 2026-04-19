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
      return await attempt();
    } catch (err) {
      lastError = err;
      if (i < retries) {
        // Wait 1s before retry
        await new Promise(res => setTimeout(res, 1000));
      }
    }
  }
  console.error(`Request failed after ${retries + 1} attempts: ${url}`);
  throw lastError;
}
