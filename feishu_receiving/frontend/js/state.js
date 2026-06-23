/**
 * State module — simple client-side state management.
 */
const State = (() => {
  let _state = {
    // Current package being viewed
    package: null,       // { trackingNumber, items[], totalItems, allConfirmed }
    // Loading state
    loading: false,
    // Error state
    error: null,         // { message: string }
    // Modal state
    discModal: {
      open: false,
      recordId: null,
      flags: {},
    },
    // Activity log (last 20)
    activities: [],
  };

  // Listeners for state changes
  const listeners = new Set();

  function get() { return _state; }

  function set(partial) {
    const prev = { ..._state };
    _state = { ..._state, ...partial };
    for (const fn of listeners) {
      try { fn(_state, prev); } catch (e) { console.error(e); }
    }
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function addActivity(type, message) {
    const activities = [
      { type, message, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) },
      ..._state.activities,
    ].slice(0, 20);
    set({ activities });
  }

  function setLoading(v) { set({ loading: v }); }
  function setError(msg) { set({ error: msg ? { message: msg } : null }); }
  function setPackage(pkg) { set({ package: pkg, error: null }); }
  function clearPackage() { set({ package: null, error: null }); }

  function openDiscModal(recordId, flags) {
    set({ discModal: { open: true, recordId, flags } });
  }
  function closeDiscModal() {
    set({ discModal: { open: false, recordId: null, flags: {} } });
  }

  // Update a single item's local state (optimistic update)
  function updateItem(recordId, changes) {
    if (!_state.package) return;
    const items = _state.package.items.map(item =>
      item.recordId === recordId ? { ...item, ...changes } : item
    );
    const allConfirmed = items.every(i => i['收货确认'] === true);
    set({
      package: { ..._state.package, items, allConfirmed }
    });
  }

  return {
    get, set, onChange,
    addActivity, setLoading, setError, setPackage, clearPackage,
    openDiscModal, closeDiscModal,
    updateItem,
  };
})();
