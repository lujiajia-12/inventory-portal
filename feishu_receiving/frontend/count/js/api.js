/**
 * Inventory count API module — fetch wrapper for backend calls.
 * Includes retry logic for transient failures.
 */
const CountAPI = (() => {
  const BASE = window.location.origin;
  const TIMEOUT_MS = 20000;
  const MAX_RETRIES = 3;
  const RETRY_BASE_MS = 500;

  class ApiError extends Error {
    constructor(status, code, message, retryable) {
      super(message);
      this.status = status;
      this.code = code;
      this.retryable = !!retryable;
    }
  }

  /**
   * Check if an error is worth retrying.
   */
  function isRetryable(err) {
    if (err instanceof ApiError && err.retryable) return true;
    if (err.name === 'AbortError') return true;
    // Network errors (fetch throws TypeError for connection refused, etc.)
    if (err instanceof TypeError && err.message.includes('fetch')) return true;
    return false;
  }

  async function request(path, options = {}) {
    let lastErr;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        console.warn(`[CountAPI] Retry ${attempt}/${MAX_RETRIES} for ${options.method || 'GET'} ${path} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(`${BASE}${path}`, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });
        clearTimeout(timeoutId);

        const body = await res.json().catch(() => ({}));

        if (!res.ok || !body.ok) {
          const err = body.error || {};
          const retryable = res.status >= 500 || res.status === 429;
          lastErr = new ApiError(res.status, err.code || 'UNKNOWN', err.message || `请求失败 (${res.status})`, retryable);
          if (retryable && attempt < MAX_RETRIES) continue;
          throw lastErr;
        }

        return body;
      } catch (e) {
        clearTimeout(timeoutId);

        if (e instanceof ApiError) {
          lastErr = e;
          if (e.retryable && attempt < MAX_RETRIES) continue;
          throw e;
        }

        if (e.name === 'AbortError') {
          lastErr = new ApiError(504, 'TIMEOUT', '请求超时，正在重试...', true);
          if (attempt < MAX_RETRIES) continue;
          throw new ApiError(504, 'TIMEOUT', '请求超时，请检查网络后重试', false);
        }

        // Network errors
        lastErr = new ApiError(0, 'NETWORK_ERROR', '网络连接失败，正在重试...', true);
        if (attempt < MAX_RETRIES) continue;
        throw new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请确认已连接同一WiFi', false);
      }
    }

    throw lastErr;
  }

  return {
    /** Search items by keyword */
    searchItems(query) {
      return request(`/api/count/search?q=${encodeURIComponent(query)}`);
    },

    /** Submit counting result */
    submitCount(recordId, prepArea, storageArea, stockQty) {
      return request('/api/count/submit', {
        method: 'POST',
        body: JSON.stringify({ recordId, prepArea, storageArea, stockQty }),
      });
    },

    /** Get counting progress */
    getProgress() {
      return request('/api/count/progress');
    },
  };
})();
