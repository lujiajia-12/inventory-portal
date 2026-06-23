/**
 * search.js — 搜索模块
 * 提供物料编码和商品名称的搜索功能，含防抖处理。
 */

/**
 * 防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟毫秒数
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 搜索控制器
 */
const SearchController = {
  /**
   * 按物料编码搜索
   * @param {string} code - 输入的编码（自动取后4位）
   * @param {Function} onResults - 结果回调 (items)
   * @param {Function} onError - 错误回调
   */
  searchByCode(code, onResults, onError) {
    const last4 = code.trim().slice(-4);
    if (!last4) {
      onResults([]);
      return;
    }
    queryByCode(last4)
      .then(onResults)
      .catch(err => {
        console.error('搜索物料编码失败:', err);
        onError && onError(err);
      });
  },

  /**
   * 按商品名称模糊搜索
   * @param {string} keyword
   * @param {Function} onResults
   * @param {Function} onError
   */
  searchByName(keyword, onResults, onError) {
    const kw = keyword.trim();
    if (!kw) {
      onResults([]);
      return;
    }
    queryByName(kw)
      .then(onResults)
      .catch(err => {
        console.error('搜索商品名称失败:', err);
        onError && onError(err);
      });
  },

  /**
   * 按条形码搜索
   * @param {string} barcode
   * @param {Function} onResult - 单个商品或 null
   * @param {Function} onError
   */
  searchByBarcode(barcode, onResult, onError) {
    if (!barcode || !barcode.trim()) {
      onResult(null);
      return;
    }
    queryByBarcode(barcode.trim())
      .then(onResult)
      .catch(err => {
        console.error('扫码搜索失败:', err);
        onError && onError(err);
      });
  },
};

/**
 * 创建防抖版搜索函数
 */
const debouncedSearchByCode = debounce(
  (code, onResults, onError) => SearchController.searchByCode(code, onResults, onError),
  300
);

const debouncedSearchByName = debounce(
  (keyword, onResults, onError) => SearchController.searchByName(keyword, onResults, onError),
  300
);
