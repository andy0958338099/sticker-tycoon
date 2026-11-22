/**
 * Cache Manager Tests
 * 測試快取管理功能
 */

const { createCache, cacheMiddleware, clearAllCaches } = require('../../utils/cache-manager');

describe('cache-manager.js', () => {
  describe('createCache', () => {
    let cache;

    beforeEach(() => {
      cache = createCache('test-cache', { ttl: 1000, max: 5 });
    });

    afterEach(() => {
      clearAllCaches();
    });

    it('應該創建快取實例', () => {
      expect(cache).toBeDefined();
      expect(typeof cache.get).toBe('function');
      expect(typeof cache.set).toBe('function');
      expect(typeof cache.has).toBe('function');
      expect(typeof cache.delete).toBe('function');
      expect(typeof cache.clear).toBe('function');
    });

    it('應該能夠設置和獲取值', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('應該能夠檢查 key 是否存在', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('應該能夠刪除值', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      
      cache.delete('key1');
      expect(cache.has('key1')).toBe(false);
    });

    it('應該能夠清空快取', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.clear();
      
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
    });

    it('應該處理不存在的 key', () => {
      // get() 對不存在的 key 回 null（不是 undefined）。
      // 這是模組的既定契約：getOrSet() 用 `cached !== null` 判斷是否存在，
      // 改成 undefined 會讓那個判斷失效。
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('應該能夠存儲不同類型的值', () => {
      cache.set('string', 'hello');
      cache.set('number', 42);
      cache.set('boolean', true);
      cache.set('object', { name: 'test' });
      cache.set('array', [1, 2, 3]);

      expect(cache.get('string')).toBe('hello');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('boolean')).toBe(true);
      expect(cache.get('object')).toEqual({ name: 'test' });
      expect(cache.get('array')).toEqual([1, 2, 3]);
    });

    it('應該在達到最大容量時移除舊項目', () => {
      const smallCache = createCache('small', { max: 3 });
      
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      smallCache.set('key4', 'value4'); // 應該移除 key1

      expect(smallCache.has('key1')).toBe(false);
      expect(smallCache.has('key4')).toBe(true);
    });

    it('應該支持 TTL 過期', (done) => {
      const shortCache = createCache('short', { ttl: 100 }); // 100ms TTL
      
      shortCache.set('key1', 'value1');
      expect(shortCache.get('key1')).toBe('value1');

      setTimeout(() => {
        // 過期後 get() 回 null（模組契約，見上方說明）
        expect(shortCache.get('key1')).toBeNull();
        done();
      }, 150);
    }, 300);
  });

  describe('clearAllCaches', () => {
    it('應該清空所有快取', () => {
      const cache1 = createCache('cache1');
      const cache2 = createCache('cache2');

      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');

      clearAllCaches();

      expect(cache1.has('key1')).toBe(false);
      expect(cache2.has('key2')).toBe(false);
    });

    it('應該能夠多次調用而不出錯', () => {
      expect(() => {
        clearAllCaches();
        clearAllCaches();
        clearAllCaches();
      }).not.toThrow();
    });
  });

  describe('cacheMiddleware', () => {
    it('應該創建中間件函數', () => {
      const middleware = cacheMiddleware('test');
      expect(typeof middleware).toBe('function');
    });

    it('中間件應該處理請求和響應', async () => {
      const middleware = cacheMiddleware('test');
      
      const mockReq = {
        method: 'GET',
        url: '/test',
        query: { id: '123' }
      };
      
      const mockRes = {
        statusCode: 200,
        setHeader: jest.fn(),
        end: jest.fn()
      };
      
      const mockNext = jest.fn();
      
      await middleware(mockReq, mockRes, mockNext);
      
      // 第一次調用應該執行 next
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('應該處理 null 和 undefined 值', () => {
      const cache = createCache('edge-test');
      
      cache.set('null-key', null);
      cache.set('undefined-key', undefined);
      
      expect(cache.get('null-key')).toBeNull();
      expect(cache.get('undefined-key')).toBeUndefined();
    });

    it('應該處理空字串 key', () => {
      const cache = createCache('edge-test');
      
      cache.set('', 'empty-key-value');
      expect(cache.get('')).toBe('empty-key-value');
    });

    it('應該處理特殊字符 key', () => {
      const cache = createCache('edge-test');
      
      const specialKeys = ['key-with-dash', 'key.with.dot', 'key@with@at', 'key:with:colon'];
      
      specialKeys.forEach((key, index) => {
        cache.set(key, `value${index}`);
        expect(cache.get(key)).toBe(`value${index}`);
      });
    });

    it('應該處理很長的 key', () => {
      const cache = createCache('edge-test');
      const longKey = 'a'.repeat(1000);
      
      cache.set(longKey, 'long-key-value');
      expect(cache.get(longKey)).toBe('long-key-value');
    });

    it('應該處理大型物件', () => {
      const cache = createCache('edge-test');
      const largeObject = {
        data: new Array(1000).fill(0).map((_, i) => ({ id: i, value: `item-${i}` }))
      };
      
      cache.set('large', largeObject);
      expect(cache.get('large')).toEqual(largeObject);
    });
  });

  describe('Performance', () => {
    it('應該快速處理大量操作', () => {
      const cache = createCache('perf-test', { max: 10000 });
      
      const start = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      for (let i = 0; i < 1000; i++) {
        cache.get(`key${i}`);
      }
      
      const duration = Date.now() - start;
      
      // 2000 次操作應該在 1 秒內完成
      expect(duration).toBeLessThan(1000);
    });
  });
});

