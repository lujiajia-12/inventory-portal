/**
 * API module — fetch wrapper for backend calls.
 */
const API = (() => {
  const BASE = window.location.origin; // Same-origin with backend
  const TIMEOUT_MS = 15000;

  class ApiError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  async function request(path, options = {}) {
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
        throw new ApiError(res.status, err.code || 'UNKNOWN', err.message || `请求失败 (${res.status})`);
      }

      return body;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof ApiError) throw e;
      if (e.name === 'AbortError') {
        throw new ApiError(504, 'TIMEOUT', '请求超时，请检查网络连接');
      }
      throw new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查服务是否启动');
    }
  }

  return {
    /**
     * Search package by tracking number.
     */
    searchPackage(trackingNumber) {
      return request(`/api/package/${encodeURIComponent(trackingNumber)}`);
    },

    /**
     * Confirm receipt for one or more records.
     */
    confirmReceive(recordIds, trackingNumber) {
      return request('/api/receive', {
        method: 'POST',
        body: JSON.stringify({ recordIds, trackingNumber: trackingNumber || '' }),
      });
    },

    /**
     * Mark a record with discrepancy flags.
     */
    markDiscrepancy(recordId, flags, note, trackingNumber) {
      return request('/api/discrepancy', {
        method: 'POST',
        body: JSON.stringify({ recordId, flags, note: note || '', trackingNumber: trackingNumber || '' }),
      });
    },

    /**
     * Get recent operation logs.
     */
    getRecentLogs(limit = 30) {
      return request(`/api/logs?limit=${limit}`);
    },

    updateSN(recordId, value) {
      return request('/api/update-sn', {
        method: 'POST',
        body: JSON.stringify({ recordId, value: value || '' }),
      });
    },
  };
})();
