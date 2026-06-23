/**
 * Scanner module — manages barcode scanner input (HID keyboard wedge).
 * Scanner sends keystrokes + Enter suffix. This module captures that.
 */
const Scanner = (() => {
  let inputEl = null;
  let debounceTimer = null;
  const DEBOUNCE_MS = 400; // prevent rapid double-scans
  const MIN_SCAN_LENGTH = 5;

  function init(inputElement, onScan) {
    inputEl = inputElement;

    // Always keep focus on the scan input
    inputEl.focus();

    // Re-focus on blur (critical: prevents scanner from losing target)
    // Skip if modal is open — user is typing in the discrepancy note
    inputEl.addEventListener('blur', () => {
      setTimeout(() => {
        const modalOpen = !document.getElementById('discModal').classList.contains('hidden');
        if (modalOpen) return;
        if (document.activeElement && document.activeElement.classList.contains('sn-input')) return;
        if (document.activeElement !== inputEl) {
          inputEl.focus();
        }
      }, 150);
    });

    // Click anywhere on the page refocuses the input
    // Skip if clicking inside modal, buttons, or any focusable element
    document.addEventListener('click', (e) => {
      const modalOpen = !document.getElementById('discModal').classList.contains('hidden');
      if (modalOpen) return;
      // Don't refocus if clicking interactive elements
      if (e.target.closest('button, textarea, input, select, .modal-overlay')) return;
      if (document.activeElement !== inputEl) {
        inputEl.focus();
      }
    });

    // Handle Enter key (barcode scanner suffix)
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = inputEl.value.trim();
        if (value.length >= MIN_SCAN_LENGTH) {
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            onScan(value);
            inputEl.value = '';
          }, DEBOUNCE_MS);
        }
      }
    });

    // Also support a manual search button if needed
    console.log('[Scanner] Initialized — waiting for scan input');
  }

  function clear() {
    if (inputEl) {
      inputEl.value = '';
      inputEl.focus();
    }
  }

  return { init, clear };
})();
