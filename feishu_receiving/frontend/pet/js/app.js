/**
 * App module — main application controller.
 * Orchestrates scan → search → confirm → auto-clear flow.
 */
const App = (() => {
  // ===== Log Loading =====

  async function loadLogs() {
    try {
      const result = await API.getRecentLogs(20);
      const logs = result.data.logs || [];
      const activities = logs.map(l => ({
        type: l['操作类型'] === '确认收货' ? 'success' : 'error',
        time: (l['操作时间'] || '').substring(5, 16),
        message: `${l['运单号'] || ''} — ${l['操作类型'] || ''} (${l['记录数'] || 0}件)`,
      }));
      State.set({ activities });
    } catch (_) {
      // Silently fail — activity log is best-effort
    }
  }

  // ===== Initialization =====

  function init() {
    // Bind scanner to input
    Scanner.init(document.getElementById('scanInput'), handleScan);

    // Bind modal submit button
    document.getElementById('btnSubmitDisc').addEventListener('click', submitDiscrepancy);

    // Keyboard shortcuts
    initKeyboard();

    // Load logs from Base
    loadLogs();

    // Listen for state changes → update UI
    State.onChange((state, prev) => {
      // Loading state change
      if (state.loading !== prev.loading) {
        if (state.loading) UI.showLoading();
      }

      // Error state change
      if (state.error !== prev.error) {
        if (state.error) UI.showError(state.error.message);
      }

      // Package change
      if (state.package !== prev.package) {
        if (state.package) {
          UI.showResults(state.package);
        } else if (!state.loading && !state.error) {
          UI.showEmpty();
        }
      }

      // Modal change
      if (state.discModal.open !== prev.discModal?.open) {
        if (state.discModal.open) {
          UI.showDiscModal(state.discModal.recordId, state.discModal.flags);
        } else {
          UI.hideDiscModal();
        }
      }

      // Activity log change
      if (state.activities !== prev.activities) {
        UI.updateActivityLog(state.activities);
      }
    });

    console.log('[App] Warehouse receiving window initialized');
  }

  // ===== Scan Handler =====

  async function handleScan(trackingNumber) {
    console.log('[App] Scan:', trackingNumber);
    State.setLoading(true);
    State.clearPackage();

    try {
      const result = await API.searchPackage(trackingNumber);
      State.setPackage(result.data);

      if (result.data.allConfirmed) {
        UI.showToast('该包裹已全部确认收货', 'info');
        State.addActivity('info', `${trackingNumber} — 已全部确认 (${result.data.totalItems}件)`);
      } else {
        State.addActivity('info', `${trackingNumber} — 找到 ${result.data.totalItems} 件`);
      }
    } catch (e) {
      State.setError(e.message);
      State.addActivity('error', `${trackingNumber} — ${e.message}`);
      UI.showToast(e.message, 'error');

      // Auto-hide error after 3s and return to empty state
      setTimeout(() => {
        if (State.get().error && State.get().error.message === e.message) {
          State.setError(null);
          State.clearPackage();
        }
      }, 3000);
    } finally {
      State.setLoading(false);
    }
  }

  // ===== Confirm Single Item =====

  async function confirmItem(recordId) {
    const pkg = State.get().package;
    const tn = pkg ? pkg.trackingNumber : '';

    // Optimistic update
    UI.markItemConfirming(recordId);
    State.updateItem(recordId, { '收货确认': true, '收货状态': '收货正常' });

    try {
      await API.confirmReceive([recordId], tn);
      UI.markItemConfirmed(recordId);
      State.addActivity('success', `确认收货 1件`);

      // Re-render cards to reflect state
      const pkg = State.get().package;
      if (pkg) {
        UI.showResults(pkg);
      }

      // Check if all confirmed → auto clear after delay
      if (pkg && pkg.allConfirmed) {
        UI.showToast(`✅ ${pkg.trackingNumber} 全部确认完成！`, 'success');
        State.addActivity('success', `${pkg.trackingNumber} — 全部确认 (${pkg.totalItems}件)`);

        setTimeout(() => {
          State.clearPackage();
          Scanner.clear();
        }, 2000);
      }
    } catch (e) {
      // Rollback optimistic update
      State.updateItem(recordId, { '收货确认': false, '收货状态': '待收货' });
      UI.showToast(`确认失败: ${e.message}`, 'error');
      State.addActivity('error', `确认失败 — ${e.message}`);
    }
  }

  // ===== Toggle Discrepancy Flag =====

  function toggleDiscrepancy(recordId, flag, button) {
    button.classList.toggle('active');

    // Collect all active flags for this item
    const row = button.closest('tr');
    const flagButtons = row.querySelectorAll('button[data-action="disc"]');
    const flags = {};
    flagButtons.forEach(btn => {
      const f = btn.dataset.flag;
      flags[f] = btn.classList.contains('active');
    });

    // If any flag active, open the discrepancy note modal
    if (Object.values(flags).some(v => v)) {
      State.openDiscModal(recordId, flags);
    } else {
      // All flags cleared
      State.closeDiscModal();
    }
  }

  // ===== Submit Discrepancy =====

  async function submitDiscrepancy() {
    const { recordId, flags, note } = UI.getDiscModalData();

    if (!recordId) return;

    UI.markItemConfirming(recordId);
    State.closeDiscModal();

    // Build discrepancy reason
    const reasons = [];
    if (flags['少件']) reasons.push('少件');
    if (flags['错件']) reasons.push('错件');
    if (flags['破损']) reasons.push('破损');
    if (flags['空包裹']) reasons.push('空包裹');

    // Optimistic update
    State.updateItem(recordId, {
      '收货确认': true,
      '收货状态': '收货异常',
      '差异原因': reasons.join('/'),
      '差异备注': note || reasons.join('/'),
      ...flags,
    });

    const pkg = State.get().package;
    const tn = pkg ? pkg.trackingNumber : '';

    try {
      await API.markDiscrepancy(recordId, flags, note, tn);
      UI.markItemConfirmed(recordId);
      UI.showToast('异常已标记', 'info');
      State.addActivity('error', `标记异常 — ${reasons.join('/')}`);

      // Re-render
      const pkg = State.get().package;
      if (pkg) UI.showResults(pkg);

      // Check all confirmed
      if (pkg && pkg.allConfirmed) {
        UI.showToast(`${pkg.trackingNumber} 全部处理完成`, 'success');
        setTimeout(() => {
          State.clearPackage();
          Scanner.clear();
        }, 2000);
      }
    } catch (e) {
      UI.showToast(`标记失败: ${e.message}`, 'error');
      State.updateItem(recordId, {
        '收货确认': false,
        '收货状态': '待收货',
        '差异原因': '',
        '差异备注': '',
        '少件': false,
        '错件': false,
        '破损': false,
        '空包裹': false,
      });
    }
  }

  // ===== Keyboard Shortcuts =====

  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Only when results are showing and modal is closed
      const pkg = State.get().package;
      if (!pkg || pkg.allConfirmed) return;

      const modalOpen = !document.getElementById('discModal').classList.contains('hidden');
      if (modalOpen) return;

      // Don't intercept if user is typing in scan input
      if (document.activeElement === document.getElementById('scanInput')) return;

      // Enter = bulk confirm all
      if (e.key === 'Enter') {
        e.preventDefault();
        bulkConfirm();
      }
    });
  }

  // ===== Bulk Confirm All =====

  async function bulkConfirm() {
    const pkg = State.get().package;
    if (!pkg || pkg.allConfirmed) return;

    const pendingItems = pkg.items.filter(i => i['收货确认'] !== true);
    if (pendingItems.length === 0) return;

    const confirmed = window.confirm(
      `确认将「${pkg.trackingNumber}」的 ${pendingItems.length} 件商品全部标记为收货正常？`
    );
    if (!confirmed) return;

    const recordIds = pendingItems.map(i => i.recordId);

    // Optimistic: mark all as confirming
    for (const item of pendingItems) {
      UI.markItemConfirming(item.recordId);
      State.updateItem(item.recordId, { '收货确认': true, '收货状态': '收货正常' });
    }

    try {
      const result = await API.confirmReceive(recordIds, pkg.trackingNumber);
      UI.showToast(`✅ 全部确认完成 (${result.data.updatedCount}件)`, 'success');
      loadLogs(); // Refresh from Base

      // Re-render
      const updatedPkg = State.get().package;
      if (updatedPkg) UI.showResults(updatedPkg);

      // Auto clear
      setTimeout(() => {
        State.clearPackage();
        Scanner.clear();
      }, 2000);
    } catch (e) {
      // Rollback
      for (const item of pendingItems) {
        State.updateItem(item.recordId, { '收货确认': false, '收货状态': '待收货' });
      }
      UI.showToast(`批量确认失败: ${e.message}`, 'error');
    }
  }

  // ===== Modal =====

  function closeDiscModal() {
    State.closeDiscModal();
    Scanner.clear(); // return focus to scan input
  }

  // ===== SN Code Save =====

  async function saveSN(recordId, value) {
    try { await API.updateSN(recordId, value); } catch (e) { UI.showToast('SN保存失败', 'error'); }
  }

  // ===== Public API =====

  return {
    init,
    handleScan,
    confirmItem,
    toggleDiscrepancy,
    submitDiscrepancy,
    bulkConfirm,
    closeDiscModal,
    saveSN,
  };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', () => App.init());
