/**
 * 快取管理器
 * 提供記憶體快取功能，減少資料庫查詢次數
 */

class CacheManager {
  constructor(options = {}) {
    this.cache = new Map();
    this.defaultTTL = options.defaultTTL || 300000; // 預設 5 分鐘
    this.maxSize = options.maxSize || 1000; // 最大快取數量
    
    // 定期清理過期快取
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // 每分鐘清理一次
  }

  /**
   * 生成快取鍵
   */
  generateKey(prefix, ...args) {
    return `${prefix}:${args.join(':')}`;
  }

  /**
   * 設定快取
   */
  set(key, value, ttl = this.defaultTTL) {
    // 如果超過最大容量，刪除最舊的項目
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expireAt: Date.now() + ttl
    });
  }

  /**
   * 取得快取
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // 檢查是否過期
    if (Date.now() > item.expireAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * 檢查 key 是否存在（且未過期）
   *
   * 過期的項目視為不存在，並順手清掉 —— 避免髒資料留在 map 裡。
   */
  has(key) {
    const item = this.cache.get(key);

    if (!item) {
      return false;
    }

    if (Date.now() > item.expireAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 刪除快取
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * 清除特定前綴的快取
   */
  deleteByPrefix(prefix) {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * 清空所有快取
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 取得或設定快取（如果不存在則執行函數）
   */
  async getOrSet(key, fetchFn, ttl = this.defaultTTL) {
    // 先嘗試從快取取得
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    // 執行函數取得資料
    const value = await fetchFn();
    
    // 只快取有效值
    if (value !== null && value !== undefined) {
      this.set(key, value, ttl);
    }

    return value;
  }

  /**
   * 清理過期快取
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expireAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 清理過期快取: ${cleanedCount} 項`);
    }
  }

  /**
   * 取得快取統計
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      usage: `${((this.cache.size / this.maxSize) * 100).toFixed(1)}%`
    };
  }

  /**
   * 銷毀快取管理器
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// 建立全域快取實例
const globalCache = new CacheManager({
  defaultTTL: 300000, // 5 分鐘
  maxSize: 1000
});

/**
 * 追蹤 createCache 建立的實例，讓 clearAllCaches 能清乾淨
 * （必須宣告在 createCache 之前 —— 否則 TDZ 錯誤）
 */
const namedCaches = new Set();

/**
 * 建立具名的快取實例（相容 API）
 *
 * 早期版本的模組用「工廠函式 + 名稱」管理多個快取，
 * 重構後改成單例 `globalCache` + `CacheManager` 類別，
 * 但既有測試與部分呼叫端仍用舊介面 → 保留這層相容。
 *
 * @param {string} name 快取名稱（僅供識別／除錯）
 * @param {Object} options { ttl, max } → 對應 defaultTTL / maxSize
 */
function createCache(name = 'default', options = {}) {
  const cache = new CacheManager({
    defaultTTL: options.ttl ?? options.defaultTTL,
    maxSize: options.max ?? options.maxSize
  });
  cache.name = name;
  namedCaches.add(cache);
  return cache;
}

/**
 * 清空所有由 createCache 建立的快取（相容 API）
 *
 * 測試隔離用：每個測試結束後呼叫，確保下一個測試拿到乾淨狀態。
 */
function clearAllCaches() {
  namedCaches.forEach((cache) => cache.clear());
  namedCaches.clear();
}

/**
 * 快取中介層（相容 API）
 *
 * 測試把它當「函式」使用（middleware(req, res, next)），
 * 但同時也期待有 get/set/has/delete/clear 方法 →
 * 回傳一個「可呼叫物件」：函式本體帶有這些方法。
 *
 * @param {string} prefix 快取鍵前綴
 */
function cacheMiddleware(prefix = '') {
  const key = (k) => (prefix ? `${prefix}:${k}` : k);

  const middleware = (req, res, next) => {
    // Express 風格的中介層：把快取讀寫掛到 req/res 上
    if (req && typeof req === 'object') {
      req.cacheKey = key(req.url || req.path || 'default');
    }
    if (typeof next === 'function') {
      next();
    }
    return middleware;
  };

  middleware.get = (k) => globalCache.get(key(k));
  middleware.set = (k, v, ttl) => globalCache.set(key(k), v, ttl);
  middleware.has = (k) => globalCache.has(key(k));
  middleware.delete = (k) => globalCache.delete(key(k));
  middleware.clear = () => globalCache.clear();

  return middleware;
}

module.exports = {
  CacheManager,
  globalCache,
  createCache,
  cacheMiddleware,
  clearAllCaches
};

