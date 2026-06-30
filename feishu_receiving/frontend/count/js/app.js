/**
 * Inventory Count App — main controller.
 * Search → Display cards → Expand & edit → Submit → Auto refresh.
 */
const CountApp = (() => {
  // ===== State =====
  let currentItems = [];       // Current search results
  let expandedCard = null;    // Currently expanded card recordId
  let progress = { total: 0, counted: 0, pending: 0, normalCount: 0, diffCount: 0 };
  let lastQuery = '';         // Preserved for retry
  let submittingIds = {};     // Track submitting state per recordId

  // DOM refs
  const $searchInput   = document.getElementById('searchInput');
  const $results       = document.getElementById('resultsContainer');
  const $itemCards     = document.getElementById('itemCards');
  const $resultCount   = document.getElementById('resultCount');
  const $emptyState    = document.getElementById('emptyState');
  const $loadingState  = document.getElementById('loadingState');
  const $errorState    = document.getElementById('errorState');
  const $errorMessage  = document.getElementById('errorMessage');
  const $errorRetry    = document.getElementById('errorRetry');
  const $toast         = document.getElementById('toast');

  // Progress stat DOM refs
  const $statCounted = document.getElementById('statCounted');
  const $statPending = document.getElementById('statPending');
  const $statTotal   = document.getElementById('statTotal');
  const $statNormal  = document.getElementById('statNormal');
  const $statDiff    = document.getElementById('statDiff');

  // ===== Toast =====
  let toastTimer = null;

  function showToast(msg, type = 'info', duration = 3000) {
    if (toastTimer) clearTimeout(toastTimer);
    $toast.textContent = msg;
    $toast.className = `toast ${type}`;
    $toast.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      $toast.classList.add('hidden');
      toastTimer = null;
    }, duration);
  }

  // ===== Progress =====

  async function loadProgress() {
    try {
      const result = await CountAPI.getProgress();
      progress = result.data;
      renderProgress();
    } catch (_) {
      // Keep stale progress, show subtle indicator
      if ($statCounted.textContent === '-') {
        $statCounted.textContent = '?';
        $statPending.textContent = '?';
        $statTotal.textContent = '?';
        $statNormal.textContent = '?';
        $statDiff.textContent = '?';
      }
    }
  }

  function renderProgress() {
    $statCounted.textContent = progress.counted;
    $statPending.textContent = progress.pending;
    $statTotal.textContent   = progress.total;
    $statNormal.textContent  = progress.normalCount;
    $statDiff.textContent    = progress.diffCount;
  }

  // ===== Search =====

  let debounceTimer = null;

  function onSearchInput() {
    const q = $searchInput.value.trim();

    if (debounceTimer) clearTimeout(debounceTimer);

    if (!q || q.length < 1) {
      lastQuery = '';
      currentItems = [];
      renderResults();
      showEmpty();
      return;
    }

    // Debounce 350ms
    debounceTimer = setTimeout(() => doSearch(q), 350);
  }

  async function doSearch(q) {
    if (!q || q.trim().length < 1) return;

    lastQuery = q;
    showLoading();
    hideError();

    try {
      const result = await CountAPI.searchItems(q);
      currentItems = result.data.items || [];

      if (currentItems.length === 0) {
        showEmpty();
        $itemCards.innerHTML = '';
        $resultCount.classList.add('hidden');
        showToast('未找到匹配项', 'info', 2000);
      } else {
        hideEmpty();
        renderResults();
        if (currentItems.length === 1) {
          expandCard(currentItems[0].recordId);
        }
      }
    } catch (e) {
      showError(e.message);
      showToast(e.message, 'error', 4000);
    } finally {
      hideLoading();
    }
  }

  function retrySearch() {
    if (lastQuery) doSearch(lastQuery);
  }

  // ===== Render =====

  function renderResults() {
    if (currentItems.length === 0) {
      $itemCards.innerHTML = '';
      $resultCount.classList.add('hidden');
      return;
    }

    $resultCount.textContent = `找到 ${currentItems.length} 条记录`;
    $resultCount.classList.remove('hidden');

    $itemCards.innerHTML = currentItems.map(item => buildCardHTML(item)).join('');
  }

  function getCardState(item) {
    const status = item['盘点状态'] || '';
    if (status.includes('差异')) return 'diff';
    if (status.includes('正常')) return 'normal';
    return 'pending';
  }

  function buildCardHTML(item) {
    const state = getCardState(item);
    const materialCode = item['物料编码'] || '';
    const productName  = item['商品名称'] || '';
    const barcode      = item['商品条码'] || '';
    const stockQty     = item['在库库存'] || '0';
    const prepArea     = item['备货区'] || '';
    const storageArea  = item['库存区'] || '';
    const status       = item['盘点状态'] || '';
    const warehouse    = item['仓库'] || '';
    const category     = item['分类'] || '';
    const warehouseCode = item['仓库代码'] || '';

    const badgeClass = state === 'normal' ? 'badge-normal' : state === 'diff' ? 'badge-diff' : 'badge-pending';
    const badgeText = state === 'normal' ? '✓ 盘点正常' : state === 'diff' ? '⚠ 盘点差异' : '待盘点';
    const cardClass = state === 'normal' ? 'card-normal' : state === 'diff' ? 'card-diff' : 'card-pending';
    const done = state !== 'pending';

    const prepNum = Number(prepArea) || 0;
    const storNum = Number(storageArea) || 0;
    const stockNum = Number(stockQty) || 0;
    const diff = stockNum - prepNum - storNum;
    const diffText = done ? `差异: ${diff >= 0 ? '+' : ''}${diff}` : '';

    return `
<div class="item-card ${cardClass}" data-record-id="${escHtml(item.recordId)}" data-state="${state}">
  <div class="card-header" onclick="CountApp.toggleCard('${escHtml(item.recordId)}')">
    <div class="card-info">
      <div class="card-code">${escHtml(materialCode)}</div>
      <div class="card-name">${escHtml(productName)}</div>
      <div class="card-meta">
        ${barcode ? escHtml(barcode) + ' · ' : ''}
        在库: ${escHtml(stockQty)}
        ${warehouse ? ' · ' + escHtml(warehouse) : ''}
        ${diffText ? ' · ' + escHtml(diffText) : ''}
      </div>
    </div>
    <span class="card-status-badge ${badgeClass}">${badgeText}</span>
    <span class="card-expand-icon" id="expandIcon_${escHtml(item.recordId)}">▼</span>
  </div>

  <div class="card-body" id="cardBody_${escHtml(item.recordId)}">
    <div class="card-readonly">
      <div class="card-field">
        <span class="card-field-label">物料编码</span>
        <span class="card-field-value">${escHtml(materialCode)}</span>
      </div>
      <div class="card-field">
        <span class="card-field-label">商品名称</span>
        <span class="card-field-value">${escHtml(productName)}</span>
      </div>
      ${barcode ? `
      <div class="card-field">
        <span class="card-field-label">商品条码</span>
        <span class="card-field-value">${escHtml(barcode)}</span>
      </div>` : ''}
      <div class="card-field">
        <span class="card-field-label">在库库存</span>
        <span class="card-field-value" style="font-size:18px;color:var(--primary)">${escHtml(stockQty)}</span>
      </div>
      ${warehouseCode ? `
      <div class="card-field">
        <span class="card-field-label">仓库代码</span>
        <span class="card-field-value">${escHtml(warehouseCode)}</span>
      </div>` : ''}
      ${category ? `
      <div class="card-field">
        <span class="card-field-label">分类</span>
        <span class="card-field-value">${escHtml(category)}</span>
      </div>` : ''}
    </div>

    ${done ? `
    <div class="card-submit-row">
      <button class="btn-submit btn-submit-done" disabled>✅ 已盘点 (${badgeText})</button>
    </div>` : `
    <div class="card-input-row">
      <div class="card-input-group">
        <label class="card-input-label">📦 备货区数量</label>
        <input type="number" class="card-input" id="inputPrep_${escHtml(item.recordId)}"
          placeholder="0" value="${escHtml(prepArea)}" inputmode="numeric" pattern="[0-9]*">
      </div>
      <div class="card-input-group">
        <label class="card-input-label">🏗️ 库存区数量</label>
        <input type="number" class="card-input" id="inputStor_${escHtml(item.recordId)}"
          placeholder="0" value="${escHtml(storageArea)}" inputmode="numeric" pattern="[0-9]*">
      </div>
    </div>
    <div class="card-submit-row">
      <button class="btn-submit btn-submit-primary"
              id="btnSubmit_${escHtml(item.recordId)}"
              onclick="CountApp.submitItem('${escHtml(item.recordId)}', ${escHtml(stockQty)})">
        ✅ 提交盘点
      </button>
    </div>`}
  </div>
</div>`;
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ===== Card Expand/Collapse =====

  function toggleCard(recordId) {
    const body = document.getElementById('cardBody_' + recordId);
    const icon = document.getElementById('expandIcon_' + recordId);
    if (!body || !icon) return;

    const isOpen = body.classList.contains('open');

    // Close all
    document.querySelectorAll('.card-body.open').forEach(b => b.classList.remove('open'));
    document.querySelectorAll('.card-expand-icon.open').forEach(i => i.classList.remove('open'));

    if (!isOpen) {
      body.classList.add('open');
      icon.classList.add('open');
      expandedCard = recordId;

      setTimeout(() => {
        const input = document.getElementById('inputPrep_' + recordId);
        if (input && !input.disabled) input.focus();
      }, 100);
    } else {
      expandedCard = null;
    }
  }

  function expandCard(recordId) {
    toggleCard(recordId);
  }

  // ===== Submit =====

  async function submitItem(recordId, stockQty) {
    // Prevent double-submit
    if (submittingIds[recordId]) return;

    const inputPrep = document.getElementById('inputPrep_' + recordId);
    const inputStor = document.getElementById('inputStor_' + recordId);
    const btnSubmit = document.getElementById('btnSubmit_' + recordId);
    const card = document.querySelector(`.item-card[data-record-id="${escHtmlAttr(recordId)}"]`);

    if (!inputPrep || !inputStor || !btnSubmit) return;

    const prepArea = inputPrep.value.trim();
    const storageArea = inputStor.value.trim();

    if (prepArea === '' && storageArea === '') {
      showToast('请至少输入备货区或库存区数量', 'error', 3000);
      return;
    }

    // Confirm
    const prepNum = Number(prepArea) || 0;
    const storNum = Number(storageArea) || 0;
    const stockNum = Number(stockQty) || 0;
    const diff = stockNum - prepNum - storNum;

    let confirmMsg = `确认提交盘点？\n备货区: ${prepNum} · 库存区: ${storNum}\n合计: ${prepNum + storNum}`;
    if (diff !== 0) {
      confirmMsg += `\n⚠ 与在库库存(${stockNum})差异: ${diff >= 0 ? '+' : ''}${diff}`;
    }

    if (!window.confirm(confirmMsg)) return;

    // Lock UI
    submittingIds[recordId] = true;
    btnSubmit.disabled = true;
    btnSubmit.textContent = '提交中...';
    inputPrep.disabled = true;
    inputStor.disabled = true;
    if (card) card.classList.add('card-submitting');

    try {
      const result = await CountAPI.submitCount(recordId, prepArea, storageArea, stockQty);

      // Update card state
      if (card) {
        card.classList.remove('card-submitting', 'card-pending');
        const newState = result.data.diff === 0 ? 'card-normal' : 'card-diff';
        card.classList.add(newState);
        card.dataset.state = result.data.diff === 0 ? 'normal' : 'diff';
      }

      // Update badge + card state, but RE-ENABLE for re-submit
      const newBadgeText = result.data.diff === 0 ? '✓ 盘点正常' : '⚠ 盘点差异';
      btnSubmit.disabled = false;
      btnSubmit.textContent = '✅ 提交盘点';
      btnSubmit.className = 'btn-submit btn-submit-primary';
      inputPrep.disabled = false;
      inputStor.disabled = false;
      if (card) card.classList.remove('card-submitting');

      // Update badge in card header
      const badge = card && card.querySelector('.card-status-badge');
      if (badge) {
        badge.className = `card-status-badge ${result.data.diff === 0 ? 'badge-normal' : 'badge-diff'}`;
        badge.textContent = newBadgeText;
      }

      // Update item in currentItems
      const idx = currentItems.findIndex(it => it.recordId === recordId);
      if (idx >= 0) {
        currentItems[idx]['备货区'] = String(prepNum);
        currentItems[idx]['库存区'] = String(storNum);
        currentItems[idx]['盘点状态'] = result.data.status;
      }

      // Refresh progress
      await loadProgress();

      const toastMsg = result.data.diff === 0
        ? '✅ 盘点正常，已提交'
        : `⚠ 盘点差异 ${result.data.diff >= 0 ? '+' : ''}${result.data.diff}，已提交`;
      showToast(toastMsg, result.data.diff === 0 ? 'success' : 'info', 3500);

    } catch (e) {
      // Restore UI
      btnSubmit.disabled = false;
      btnSubmit.textContent = '✅ 提交盘点';
      btnSubmit.className = 'btn-submit btn-submit-primary';
      inputPrep.disabled = false;
      inputStor.disabled = false;
      if (card) card.classList.remove('card-submitting');
      showToast(`提交失败: ${e.message}`, 'error', 5000);
    } finally {
      delete submittingIds[recordId];
    }
  }

  function escHtmlAttr(s) {
    return escHtml(s).replace(/"/g, '&quot;');
  }

  // ===== UI State Helpers =====

  function showEmpty() {
    $emptyState.classList.remove('hidden');
    $results.style.display = 'none';
  }

  function hideEmpty() {
    $emptyState.classList.add('hidden');
    $results.style.display = 'block';
  }

  function showLoading() {
    $loadingState.classList.remove('hidden');
    $emptyState.classList.add('hidden');
    $errorState.classList.add('hidden');
    $results.style.display = 'none';
  }

  function hideLoading() {
    $loadingState.classList.add('hidden');
  }

  function showError(msg) {
    $errorState.classList.remove('hidden');
    $errorMessage.textContent = msg;
    $loadingState.classList.add('hidden');
    // Show retry button if we have a last query
    if (lastQuery && $errorRetry) {
      $errorRetry.style.display = 'inline-block';
    }
  }

  function hideError() {
    $errorState.classList.add('hidden');
    if ($errorRetry) $errorRetry.style.display = 'none';
  }

  // ===== Init =====

  function init() {
    // Search input handler
    $searchInput.addEventListener('input', onSearchInput);

    // Trigger on Enter key (instant, no debounce)
    $searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (debounceTimer) clearTimeout(debounceTimer);
        const q = $searchInput.value.trim();
        if (q) doSearch(q);
      }
    });

    // Retry button
    if ($errorRetry) {
      $errorRetry.addEventListener('click', retrySearch);
    }

    // Load initial progress
    loadProgress();

    console.log('[CountApp] Warehouse counting window initialized');
  }

  // ===== Public API =====

  return {
    init,
    toggleCard,
    submitItem,
  };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', () => CountApp.init());
