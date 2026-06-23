/**
 * UI module — DOM rendering, animations, toast, activity log.
 */
const UI = (() => {
  // Cache DOM refs
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let domCache = null;
  function dom() {
    if (!domCache) {
      domCache = {
        scanInput: $('#scanInput'),
        resultsContainer: $('#resultsContainer'),
        emptyState: $('#emptyState'),
        loadingState: $('#loadingState'),
        errorState: $('#errorState'),
        errorMessage: $('#errorMessage'),
        pkgTracking: $('#pkgTracking'),
        pkgCount: $('#pkgCount'),
        pkgStatus: $('#pkgStatus'),
        btnBulkConfirm: $('#btnBulkConfirm'),
        itemCards: $('#itemCards'),
        discModal: $('#discModal'),
        discNote: $('#discNote'),
        btnSubmitDisc: $('#btnSubmitDisc'),
        activityList: $('#activityList'),
        toast: $('#toast'),
      };
    }
    return domCache;
  }

  // ===== State → DOM =====

  function showLoading() {
    const d = dom();
    d.emptyState.classList.add('hidden');
    d.errorState.classList.add('hidden');
    d.resultsContainer.classList.add('hidden');
    d.loadingState.classList.remove('hidden');
  }

  function showError(message) {
    const d = dom();
    d.loadingState.classList.add('hidden');
    d.emptyState.classList.add('hidden');
    d.resultsContainer.classList.add('hidden');
    d.errorState.classList.remove('hidden');
    d.errorMessage.textContent = message;
  }

  function showEmpty() {
    const d = dom();
    d.loadingState.classList.add('hidden');
    d.errorState.classList.add('hidden');
    d.resultsContainer.classList.add('hidden');
    d.emptyState.classList.remove('hidden');
  }

  function showResults(pkg) {
    const d = dom();
    d.loadingState.classList.add('hidden');
    d.errorState.classList.add('hidden');
    d.emptyState.classList.add('hidden');
    d.resultsContainer.classList.remove('hidden');

    // Update package bar
    d.pkgTracking.textContent = pkg.trackingNumber;
    d.pkgCount.textContent = pkg.totalItems;

    // Status badge
    if (pkg.allConfirmed) {
      d.pkgStatus.textContent = '✅ 全部已确认';
      d.pkgStatus.className = 'package-status done';
      d.btnBulkConfirm.disabled = true;
    } else {
      d.pkgStatus.textContent = '⏳ 待收货';
      d.pkgStatus.className = 'package-status pending';
      d.btnBulkConfirm.disabled = false;
    }

    // Render item table
    renderTable(pkg.items);

    // Scroll results into view
    d.resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTable(items) {
    const d = dom();
    d.itemCards.innerHTML = '';

    // Build table
    let html = `
      <div class="item-table-wrap">
      <table class="item-table">
      <thead>
        <tr>
          <th class="col-code">70迈料号</th>
          <th class="col-name">70迈物料名称</th>
          <th class="col-qty">实退数量</th>
          <th class="col-sn">SN码</th>
          <th class="col-status">状态</th>
          <th class="col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
    `;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Status
      let rowClass = 'row-pending';
      let badgeClass = 'badge-pending';
      let badgeText = '待收货';
      if (item['收货确认'] === true) {
        const hasDiscrepancy =
          item['少件'] === true || item['错件'] === true ||
          item['破损'] === true || item['空包'] === true;
        if (hasDiscrepancy) {
          rowClass = 'row-error';
          badgeClass = 'badge-error';
          badgeText = '⚠ 异常';
        } else {
          rowClass = 'row-ok';
          badgeClass = 'badge-ok';
          badgeText = '✅ 已确认';
        }
      }

      const isDone = item['收货确认'] === true;
      const lessActive = item['少件'] === true ? ' active' : '';
      const wrongActive = item['错件'] === true ? ' active' : '';
      const damageActive = item['破损'] === true ? ' active' : '';
      const emptyActive = item['空包'] === true ? ' active' : '';

      html += `
        <tr class="${rowClass}" data-id="${item.recordId}">
          <td class="col-code">${escHtml(item['70迈料号'] || item['商品编码'] || '-')}</td>
          <td class="col-name">${escHtml(item['70迈物料名称'] || item['商品名称'] || '-')}</td>
          <td class="col-qty">${escHtml(item['实退数量'] || '-')}</td>
          <td class="col-sn"><input class="sn-input" value="${escHtml(item['SN码'] || '')}" data-id="${item.recordId}" placeholder="扫描SN..." /></td>
          <td class="col-status"><span class="item-status-badge ${badgeClass}">${badgeText}</span></td>
          <td class="col-actions">
            ${!isDone ? `
              <button class="btn btn-outline btn-sm${lessActive}" data-action="disc" data-flag="少件" data-id="${item.recordId}">少件</button>
              <button class="btn btn-outline btn-sm${wrongActive}" data-action="disc" data-flag="错件" data-id="${item.recordId}">错件</button>
              <button class="btn btn-outline btn-sm${damageActive}" data-action="disc" data-flag="破损" data-id="${item.recordId}">破损</button>
              <button class="btn btn-outline btn-sm${emptyActive}" data-action="disc" data-flag="空包裹" data-id="${item.recordId}">空包</button>
            ` : (item['差异备注'] ? `<span class="disc-note">📝 ${escHtml(item['差异备注'])}</span>` : '')}
          </td>
        </tr>
      `;
    }

    html += '</tbody></table></div>';
    d.itemCards.innerHTML = html;

    // Bind discrepancy buttons
    d.itemCards.querySelectorAll('button[data-action="disc"]').forEach(btn => {
      btn.addEventListener('click', () => App.toggleDiscrepancy(btn.dataset.id, btn.dataset.flag, btn));
    });

    // Bind SN input save
    d.itemCards.querySelectorAll('.sn-input').forEach(input => {
      input.addEventListener('blur', () => App.saveSN(input.dataset.id, input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    });
  }

  // ===== Modal =====

  function showDiscModal(recordId, flags) {
    const d = dom();
    d.discNote.value = '';
    d.discModal.classList.remove('hidden');
    d.btnSubmitDisc.dataset.id = recordId;
    d.btnSubmitDisc.dataset.flags = JSON.stringify(flags);
    d.discNote.focus();
  }

  function hideDiscModal() {
    dom().discModal.classList.add('hidden');
  }

  function getDiscModalData() {
    const d = dom();
    return {
      recordId: d.btnSubmitDisc.dataset.id,
      flags: JSON.parse(d.btnSubmitDisc.dataset.flags || '{}'),
      note: d.discNote.value.trim(),
    };
  }

  // ===== Toast =====

  function showToast(message, type = 'info') {
    const d = dom();
    d.toast.textContent = message;
    d.toast.className = `toast ${type}`;
    d.toast.classList.remove('hidden');
    clearTimeout(d.toast._timer);
    d.toast._timer = setTimeout(() => {
      d.toast.classList.add('hidden');
    }, 2000);
  }

  // ===== Activity Log =====

  function updateActivityLog(activities) {
    const d = dom();
    if (activities.length === 0) {
      d.activityList.innerHTML = '<div class="activity-empty">暂无操作记录</div>';
      return;
    }
    d.activityList.innerHTML = activities.map(a =>
      `<div class="activity-item">
        <span>${a.time}</span>
        <span>${a.type === 'success' ? '✅' : a.type === 'error' ? '❌' : 'ℹ️'}</span>
        <span>${escHtml(a.message)}</span>
      </div>`
    ).join('');
  }

  // ===== Item Card Updates (after optimistic confirm) =====

  function markItemConfirming(recordId) {
    const row = document.querySelector(`tr[data-id="${recordId}"]`);
    if (row) row.classList.add('row-confirming');
  }

  function markItemConfirmed(recordId) {
    const row = document.querySelector(`tr[data-id="${recordId}"]`);
    if (row) {
      row.classList.remove('row-confirming');
      row.classList.add('flash-confirm');
      setTimeout(() => row.classList.remove('flash-confirm'), 600);
    }
  }

  // ===== Helpers =====

  function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  return {
    showLoading, showError, showEmpty, showResults,
    showDiscModal, hideDiscModal, getDiscModalData,
    showToast, updateActivityLog,
    markItemConfirming, markItemConfirmed,
  };
})();
