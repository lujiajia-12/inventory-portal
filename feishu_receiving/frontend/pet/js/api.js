const API = (() => {
  const BASE = window.location.origin;
  const TIMEOUT_MS = 15000;

  class ApiError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${path}`, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...options.headers } });
      clearTimeout(timeoutId);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) { const err = body.error || {}; throw new ApiError(res.status, err.code || 'UNKNOWN', err.message || `请求失败 (${res.status})`); }
      return body;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof ApiError) throw e;
      if (e.name === 'AbortError') throw new ApiError(504, 'TIMEOUT', '请求超时');
      throw new ApiError(0, 'NETWORK_ERROR', '网络连接失败');
    }
  }

  return {
    searchPackage(tn) { return request(`/api/pet/package/${encodeURIComponent(tn)}`); },
    confirmReceive(recordIds, tn) { return request('/api/pet/receive', { method: 'POST', body: JSON.stringify({ recordIds, trackingNumber: tn || '' }) }); },
    markDiscrepancy(recordId, flags, note, tn) { return request('/api/pet/discrepancy', { method: 'POST', body: JSON.stringify({ recordId, flags, note: note || '', trackingNumber: tn || '' }) }); },
    getRecentLogs(limit = 30) { return request(`/api/logs?limit=${limit}`); },

    updateSN(recordId, value) {
      return request('/api/update-sn', {
        method: 'POST',
        body: JSON.stringify({ recordId, value: value || '', tableId: 'tbl5wnTUjD9HWzXJ' }),
      });
    },
  };
})();
