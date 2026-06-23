/**
 * app.js — 主逻辑
 * 状态机驱动的盘点流程：搜索 → 选择 → 盘点 → 提交 → 循环
 */

const App = {
  // === 状态 ===
  currentTab: 'code',          // 'code' | 'name' | 'scan'
  currentView: 'search',       // 'search' | 'results' | 'detail' | 'complete'
  searchResults: [],           // 当前搜索结果
  currentItem: null,           // 当前正在盘点的商品
  allItems: [],                // 全部商品
  countedIds: new Set(),       // 已盘点 ID 集合

  // === 初始化 ===
  async init() {
    this.cacheDom();
    this.bindEvents();
    this.refreshStats();

    // 加载全部商品列表
    this.allItems = await getAllItems();
    this.countedIds = Storage.getCountedIds();

    // 检查是否全部盘点完毕
    if (this.countedIds.size >= this.allItems.length && this.allItems.length > 0) {
      this.showView('complete');
    }
  },

  // === DOM 缓存 ===
  cacheDom() {
    // Tabs
    this.els = {
      tabBtns: document.querySelectorAll('.tab-btn'),
      panels: {
        code: document.getElementById('panel-code'),
        name: document.getElementById('panel-name'),
        scan: document.getElementById('panel-scan'),
      },
      // 搜索
      inputCode: document.getElementById('inputCode'),
      inputName: document.getElementById('inputName'),
      btnClearCode: document.getElementById('btnClearCode'),
      btnClearName: document.getElementById('btnClearName'),
      searchSection: document.getElementById('searchSection'),
      // 扫码
      btnStartScan: document.getElementById('btnStartScan'),
      btnStopScan: document.getElementById('btnStopScan'),
      scanResult: document.getElementById('scanResult'),
      scanPlaceholder: document.getElementById('scanPlaceholder'),
      reader: document.getElementById('reader'),
      // 结果
      resultsSection: document.getElementById('resultsSection'),
      resultsList: document.getElementById('resultsList'),
      resultsCount: document.getElementById('resultsCount'),
      resultsEmpty: document.getElementById('resultsEmpty'),
      btnBackToSearch: document.getElementById('btnBackToSearch'),
      // 明细
      detailSection: document.getElementById('detailSection'),
      detailCard: document.getElementById('detailCard'),
      btnBackToResults: document.getElementById('btnBackToResults'),
      inputPrepArea: document.getElementById('inputPrepArea'),
      inputStorageArea: document.getElementById('inputStorageArea'),
      summaryStock: document.getElementById('summaryStock'),
      summaryTotal: document.getElementById('summaryTotal'),
      summaryDiff: document.getElementById('summaryDiff'),
      summaryDiffRow: document.getElementById('summaryDiffRow'),
      btnSubmit: document.getElementById('btnSubmit'),
      // 完成
      completeSection: document.getElementById('completeSection'),
      completeSummary: document.getElementById('completeSummary'),
      btnExport: document.getElementById('btnExport'),
      btnReset: document.getElementById('btnReset'),
      // 统计
      statTotal: document.getElementById('statTotal'),
      statCounted: document.getElementById('statCounted'),
      statRemaining: document.getElementById('statRemaining'),
      // Toast
      toast: document.getElementById('toast'),
    };
  },

  // === 事件绑定 ===
  bindEvents() {
    // Tab 切换
    this.els.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // 物料编码输入
    this.els.inputCode.addEventListener('input', () => {
      this.toggleClearBtn('code');
      debouncedSearchByCode(
        this.els.inputCode.value,
        (results) => this.showResults(results),
        () => this.showToast('搜索失败，请重试', 'error')
      );
    });

    this.els.inputCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        SearchController.searchByCode(
          this.els.inputCode.value,
          (results) => this.showResults(results),
          () => this.showToast('搜索失败', 'error')
        );
      }
    });

    // 商品名称输入
    this.els.inputName.addEventListener('input', () => {
      this.toggleClearBtn('name');
      debouncedSearchByName(
        this.els.inputName.value,
        (results) => this.showResults(results),
        () => this.showToast('搜索失败，请重试', 'error')
      );
    });

    this.els.inputName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        SearchController.searchByName(
          this.els.inputName.value,
          (results) => this.showResults(results),
          () => this.showToast('搜索失败', 'error')
        );
      }
    });

    // 清除按钮
    this.els.btnClearCode.addEventListener('click', () => {
      this.els.inputCode.value = '';
      this.toggleClearBtn('code');
      this.els.inputCode.focus();
    });

    this.els.btnClearName.addEventListener('click', () => {
      this.els.inputName.value = '';
      this.toggleClearBtn('name');
      this.els.inputName.focus();
    });

    // 扫码
    this.els.btnStartScan.addEventListener('click', () => this.startScan());
    this.els.btnStopScan.addEventListener('click', () => this.stopScan());

    // 返回搜索
    this.els.btnBackToSearch.addEventListener('click', () => this.showView('search'));
    this.els.btnBackToResults.addEventListener('click', () => {
      if (this.searchResults.length > 0) {
        this.showView('results');
        this.renderResultsList();
      } else {
        this.showView('search');
      }
    });

    // 盘点表单：实时计算汇总
    this.els.inputPrepArea.addEventListener('input', () => this.updateSummary());
    this.els.inputStorageArea.addEventListener('input', () => this.updateSummary());

    // 提交
    this.els.btnSubmit.addEventListener('click', () => this.submitCounting());

    // 快捷键 Ctrl+Enter 提交
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (this.currentView === 'detail') {
          e.preventDefault();
          this.submitCounting();
        }
      }
    });

    // 导出 & 重置
    this.els.btnExport.addEventListener('click', () => this.exportRecords());
    this.els.btnReset.addEventListener('click', () => this.resetAll());
  },

  // === Tab 切换 ===
  switchTab(tab) {
    this.currentTab = tab;

    // 更新 Tab 按钮激活状态
    this.els.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // 切换面板
    Object.entries(this.els.panels).forEach(([key, panel]) => {
      panel.classList.toggle('active', key === tab);
    });

    // 停止扫码（如果切换到非扫码tab）
    if (tab !== 'scan') {
      this.stopScan();
    }

    // 隐藏结果
    this.els.resultsSection.classList.add('hidden');
    this.els.searchSection.classList.remove('hidden');

    // 聚焦对应输入框
    if (tab === 'code') {
      this.els.inputCode.focus();
    } else if (tab === 'name') {
      this.els.inputName.focus();
    }
  },

  // === 清除按钮显隐 ===
  toggleClearBtn(tab) {
    const input = tab === 'code' ? this.els.inputCode : this.els.inputName;
    const btn = tab === 'code' ? this.els.btnClearCode : this.els.btnClearName;
    if (input.value.trim()) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  },

  // === 扫码 ===
  async startScan() {
    // 隐藏占位文字
    this.els.scanPlaceholder.classList.add('hidden');
    this.els.scanResult.classList.add('hidden');
    this.els.reader.style.display = 'block';

    this.els.btnStartScan.classList.add('hidden');
    this.els.btnStopScan.classList.remove('hidden');

    Scanner.init('reader');

    try {
      await Scanner.start(
        // 扫描成功
        (barcode) => {
          this.showToast(`扫描到: ${barcode}`, 'success');
          this.els.scanResult.textContent = `✓ 已识别条码: ${barcode}`;
          this.els.scanResult.className = 'scan-result';
          this.els.scanResult.classList.remove('hidden');

          // 搜索对应商品
          SearchController.searchByBarcode(
            barcode,
            (item) => {
              if (item) {
                // 找到商品，直接进入盘点明细
                this.stopScan();
                this.currentItem = item;
                this.showDetail(item);
                this.showToast(`找到商品: ${item.name}`, 'success');
              } else {
                this.els.scanResult.textContent = `✗ 未找到条码 ${barcode} 对应的商品`;
                this.els.scanResult.className = 'scan-result error';
                this.els.scanResult.classList.remove('hidden');
              }
            },
            () => this.showToast('搜索失败', 'error')
          );
        },
        // 扫描错误（启动失败）
        (errorMessage) => {
          this.showToast(errorMessage, 'error');
        }
      );
    } catch (err) {
      this.showToast(err.message || '启动扫码失败', 'error');
      this.stopScan();
    }
  },

  async stopScan() {
    await Scanner.stop();
    this.els.btnStartScan.classList.remove('hidden');
    this.els.btnStopScan.classList.add('hidden');
    this.els.scanPlaceholder.classList.remove('hidden');
    // 不隐藏 scanResult，保留上次结果
  },

  // === 搜索结果 ===
  showResults(results) {
    this.searchResults = results;

    if (this.currentView === 'detail') {
      // 正在盘点中，不打断
      return;
    }

    this.els.searchSection.classList.add('hidden');
    this.els.resultsSection.classList.remove('hidden');
    this.els.detailSection.classList.add('hidden');
    this.els.completeSection.classList.add('hidden');
    this.currentView = 'results';

    this.renderResultsList();
  },

  renderResultsList() {
    const { resultsList, resultsCount, resultsEmpty } = this.els;

    resultsCount.textContent = `共 ${this.searchResults.length} 条`;

    if (this.searchResults.length === 0) {
      resultsList.innerHTML = '';
      resultsEmpty.classList.remove('hidden');
      return;
    }

    resultsEmpty.classList.add('hidden');

    resultsList.innerHTML = this.searchResults.map(item => {
      const counted = this.countedIds.has(item.id);
      const statusClass = counted ? 'counted' : 'pending';
      const statusText = counted ? '已盘' : '待盘';

      return `
        <div class="result-item" data-id="${item.id}">
          <div class="item-name">${this.escapeHtml(item.name)}</div>
          <div class="item-meta">
            <span>📋 ${this.escapeHtml(item.code)}</span>
            <span>📦 在库: ${item.stock} ${item.unit}</span>
            <span>🔢 ${item.barcode}</span>
          </div>
          <span class="item-status ${statusClass}">${statusText}</span>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    resultsList.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.id);
        const item = this.searchResults.find(i => i.id === id);
        if (item) {
          this.currentItem = item;
          this.showDetail(item);
        }
      });
    });
  },

  // === 盘点明细 ===
  showDetail(item) {
    this.currentItem = item;
    this.currentView = 'detail';

    this.els.searchSection.classList.add('hidden');
    this.els.resultsSection.classList.add('hidden');
    this.els.detailSection.classList.remove('hidden');
    this.els.completeSection.classList.add('hidden');

    // 停止扫码
    if (this.currentTab === 'scan') {
      this.stopScan();
    }

    // 渲染商品信息卡片
    this.els.detailCard.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">商品名称</span>
        <span class="detail-value">${this.escapeHtml(item.name)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">物料编码</span>
        <span class="detail-value code">${this.escapeHtml(item.code)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">商品69码</span>
        <span class="detail-value barcode">${this.escapeHtml(item.barcode)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">在库数量</span>
        <span class="detail-value stock">${item.stock} ${item.unit}</span>
      </div>
    `;

    // 如果已经盘点过，回填
    const record = Storage.getRecords().find(r => r.id === item.id);
    if (record) {
      this.els.inputPrepArea.value = record.prepArea || '';
      this.els.inputStorageArea.value = record.storageArea || '';
    } else {
      this.els.inputPrepArea.value = '';
      this.els.inputStorageArea.value = '';
    }

    this.updateSummary();
    this.els.inputPrepArea.focus();

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // === 汇总计算 ===
  updateSummary() {
    const prep = parseInt(this.els.inputPrepArea.value) || 0;
    const storage = parseInt(this.els.inputStorageArea.value) || 0;
    const total = prep + storage;
    const stock = this.currentItem ? this.currentItem.stock : 0;
    const diff = total - stock;

    this.els.summaryStock.textContent = `${stock} ${this.currentItem?.unit || ''}`;
    this.els.summaryTotal.textContent = `${total} ${this.currentItem?.unit || ''}`;

    if (total === 0) {
      this.els.summaryDiff.textContent = '-';
      this.els.summaryDiffRow.classList.remove('match');
    } else if (diff === 0) {
      this.els.summaryDiff.textContent = '0 (一致 ✓)';
      this.els.summaryDiffRow.classList.add('match');
    } else if (diff > 0) {
      this.els.summaryDiff.textContent = `+${diff} (盘盈)`;
      this.els.summaryDiffRow.classList.remove('match');
    } else {
      this.els.summaryDiff.textContent = `${diff} (盘亏)`;
      this.els.summaryDiffRow.classList.remove('match');
    }
  },

  // === 提交盘点 ===
  submitCounting() {
    if (!this.currentItem) return;

    const prepVal = this.els.inputPrepArea.value.trim();
    const storageVal = this.els.inputStorageArea.value.trim();

    // 校验：至少填一个
    if (!prepVal && !storageVal) {
      this.showToast('请至少填写备货区或库存区数量', 'error');
      this.els.inputPrepArea.focus();
      return;
    }

    const prepNum = parseInt(prepVal) || 0;
    const storageNum = parseInt(storageVal) || 0;

    if (prepVal && prepNum < 0) {
      this.showToast('备货区数量不能为负数', 'error');
      return;
    }
    if (storageVal && storageNum < 0) {
      this.showToast('库存区数量不能为负数', 'error');
      return;
    }

    // 保存记录
    const record = Storage.saveRecord({
      id: this.currentItem.id,
      name: this.currentItem.name,
      code: this.currentItem.code,
      barcode: this.currentItem.barcode,
      stock: this.currentItem.stock,
      prepArea: prepVal,
      storageArea: storageVal,
      unit: this.currentItem.unit,
    });

    // 更新已盘点集合
    this.countedIds.add(this.currentItem.id);

    // 刷新统计
    this.refreshStats();

    // 提示
    const total = prepNum + storageNum;
    const diff = total - this.currentItem.stock;
    let diffMsg = '';
    if (diff === 0) {
      diffMsg = '数量一致 ✓';
    } else if (diff > 0) {
      diffMsg = `盘盈 +${diff}`;
    } else {
      diffMsg = `盘亏 ${diff}`;
    }

    this.showToast(`✅ 已提交！${this.currentItem.name} | 盘点: ${total} | ${diffMsg}`, 'success');

    // 禁用提交按钮短暂防止重复提交
    this.els.btnSubmit.disabled = true;
    setTimeout(() => { this.els.btnSubmit.disabled = false; }, 800);

    // 查找下一个待盘商品
    this.goToNextItem();
  },

  // === 跳转到下一个待盘商品 ===
  goToNextItem() {
    // 优先在搜索结果中找下一个未盘的
    const nextInResults = this.searchResults.find(
      item => !this.countedIds.has(item.id) && item.id !== this.currentItem?.id
    );

    if (nextInResults) {
      // 搜索结果中还有未盘的
      this.currentItem = nextInResults;
      this.showDetail(nextInResults);
      return;
    }

    // 在所有商品中找下一个未盘的
    const nextInAll = this.allItems.find(
      item => !this.countedIds.has(item.id)
    );

    if (nextInAll) {
      // 还有未盘商品，回到搜索页让用户搜索
      this.currentView = 'search';
      this.els.detailSection.classList.add('hidden');
      this.els.searchSection.classList.remove('hidden');
      this.els.resultsSection.classList.add('hidden');
      this.els.completeSection.classList.add('hidden');

      // 清空搜索
      this.els.inputCode.value = '';
      this.els.inputName.value = '';
      this.els.resultsList.innerHTML = '';
      this.searchResults = [];

      if (this.currentTab === 'code') {
        this.els.inputCode.focus();
      } else if (this.currentTab === 'name') {
        this.els.inputName.focus();
      }

      this.showToast('请继续搜索下一个盘点商品 📦', 'success');
    } else {
      // 全部盘点完毕
      this.showView('complete');
    }
  },

  // === 视图切换 ===
  showView(view) {
    this.currentView = view;

    this.els.searchSection.classList.toggle('hidden', view !== 'search');
    this.els.resultsSection.classList.toggle('hidden', view !== 'results');
    this.els.detailSection.classList.toggle('hidden', view !== 'detail');
    this.els.completeSection.classList.toggle('hidden', view !== 'complete');

    if (view === 'complete') {
      this.renderComplete();
    }

    if (view === 'search') {
      this.els.resultsList.innerHTML = '';
      this.searchResults = [];
    }
  },

  // === 完成页 ===
  renderComplete() {
    const records = Storage.getRecords();
    const totalItems = this.allItems.length;

    this.els.completeSummary.textContent =
      `已完成 ${records.length} / ${totalItems} 件商品盘点，所有商品已盘点完毕。`;

    // 最后一次刷新统计
    this.refreshStats();
  },

  // === 统计刷新 ===
  refreshStats() {
    const stats = Storage.getStats(this.allItems.length);
    this.els.statTotal.textContent = `合计: ${stats.total}`;
    this.els.statCounted.textContent = `已盘: ${stats.counted}`;
    this.els.statRemaining.textContent = `剩余: ${stats.remaining}`;
  },

  // === 导出 ===
  exportRecords() {
    const records = Storage.getRecords();
    if (records.length === 0) {
      this.showToast('暂无盘点记录可导出', 'error');
      return;
    }

    const csv = Storage.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `盘点记录_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast('导出成功！', 'success');
  },

  // === 重置 ===
  resetAll() {
    if (!confirm('确定要清空所有盘点记录并重新开始吗？此操作不可恢复。')) {
      return;
    }

    Storage.clearAll();
    this.countedIds.clear();
    this.searchResults = [];
    this.currentItem = null;

    this.refreshStats();
    this.showView('search');

    this.els.inputCode.value = '';
    this.els.inputName.value = '';

    this.showToast('已重置，可以重新盘点', 'success');
  },

  // === Toast ===
  showToast(message, type) {
    const { toast } = this.els;
    toast.textContent = message;
    toast.className = `toast ${type || ''} show`;

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  },

  // === 工具函数 ===
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};

// === 启动应用 ===
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
