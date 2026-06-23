/**
 * storage.js — 本地存储模块
 * 用于持久化盘点提交记录，支持导出。
 *
 * 存储结构:
 *   inventory_records: [
 *     {
 *       id: 1,
 *       name: '...',
 *       code: '...',
 *       barcode: '...',
 *       stock: 100,
 *       prepArea: '30',
 *       storageArea: '70',
 *       unit: '箱',
 *       countedAt: '2025-01-15T10:30:00.000Z'
 *     }, ...
 *   ]
 */

const STORAGE_KEY = 'inventory_records';

const Storage = {
  /**
   * 获取所有盘点记录
   * @returns {Array}
   */
  getRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('读取盘点记录失败:', e);
      return [];
    }
  },

  /**
   * 保存一条盘点记录（追加或更新）
   * @param {Object} record - 盘点记录
   */
  saveRecord(record) {
    const records = this.getRecords();
    // 检查是否已有该商品的记录，有则更新
    const index = records.findIndex(r => r.id === record.id);
    const newRecord = {
      ...record,
      countedAt: new Date().toISOString(),
    };
    if (index >= 0) {
      records[index] = newRecord;
    } else {
      records.push(newRecord);
    }
    this._saveAll(records);
    return newRecord;
  },

  /**
   * 获取已盘点的商品 ID 集合
   * @returns {Set<number>}
   */
  getCountedIds() {
    const records = this.getRecords();
    return new Set(records.map(r => r.id));
  },

  /**
   * 检查某个商品是否已盘点
   * @param {number} id
   * @returns {boolean}
   */
  isCounted(id) {
    return this.getCountedIds().has(id);
  },

  /**
   * 获取盘点统计
   * @returns {{ total: number, counted: number, remaining: number }}
   */
  getStats(total) {
    const counted = this.getRecords().length;
    return {
      total: total,
      counted: counted,
      remaining: Math.max(0, total - counted),
    };
  },

  /**
   * 导出为 CSV 字符串
   * @returns {string}
   */
  exportCSV() {
    const records = this.getRecords();
    if (records.length === 0) return '';

    const headers = ['商品名称', '物料编码', '商品69码', '在库数量', '备货区', '库存区', '单位', '盘点时间'];
    const rows = records.map(r => [
      r.name,
      r.code,
      r.barcode,
      r.stock,
      r.prepArea,
      r.storageArea,
      r.unit,
      new Date(r.countedAt).toLocaleString('zh-CN'),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // BOM for Excel UTF-8 compatibility
    return '﻿' + csvContent;
  },

  /**
   * 导出为 JSON 字符串
   * @returns {string}
   */
  exportJSON() {
    return JSON.stringify(this.getRecords(), null, 2);
  },

  /**
   * 清空所有盘点记录
   */
  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  },

  /**
   * 内部方法：保存全部记录
   */
  _saveAll(records) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.error('保存盘点记录失败:', e);
      throw new Error('存储空间不足，请清理浏览器数据');
    }
  },
};
