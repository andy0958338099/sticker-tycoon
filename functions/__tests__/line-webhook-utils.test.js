/**
 * LINE Webhook Utils Tests
 * 測試 LINE Webhook 的輔助函數
 */

// 由於 line-webhook.js 中的函數沒有 export，我們在這裡重新實現並測試
// 這些是從 line-webhook.js 複製的純函數

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function pickRandomIdFromRecord(record) {
  const keys = Object.keys(record || {});
  if (keys.length === 0) return null;
  const idx = Math.floor(Math.random() * keys.length);
  return keys[idx];
}

function pickRandomFromArray(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

describe('line-webhook-utils.js', () => {
  describe('shuffleArray', () => {
    it('應該返回相同長度的陣列', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(original);
      
      expect(shuffled.length).toBe(original.length);
    });

    it('應該包含原始陣列的所有元素', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(original);
      
      original.forEach(item => {
        expect(shuffled).toContain(item);
      });
    });

    it('不應該修改原始陣列', () => {
      const original = [1, 2, 3, 4, 5];
      const originalCopy = [...original];
      
      shuffleArray(original);
      
      expect(original).toEqual(originalCopy);
    });

    it('應該處理空陣列', () => {
      const shuffled = shuffleArray([]);
      expect(shuffled).toEqual([]);
    });

    it('應該處理單元素陣列', () => {
      const shuffled = shuffleArray([42]);
      expect(shuffled).toEqual([42]);
    });

    it('應該處理兩元素陣列', () => {
      const original = [1, 2];
      const shuffled = shuffleArray(original);
      
      expect(shuffled.length).toBe(2);
      expect(shuffled).toContain(1);
      expect(shuffled).toContain(2);
    });

    it('對於較大的陣列，很可能產生不同的順序', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = shuffleArray(original);
      
      // 理論上有可能相同，但機率極小（1/10! ≈ 0.0000003%）
      // 在實際測試中幾乎不可能發生
      let isDifferent = false;
      for (let i = 0; i < original.length; i++) {
        if (original[i] !== shuffled[i]) {
          isDifferent = true;
          break;
        }
      }
      
      // 如果測試失敗，可能是運氣不好，可以重新執行
      expect(isDifferent).toBe(true);
    });
  });

  describe('pickRandomIdFromRecord', () => {
    it('應該從物件中選擇一個 key', () => {
      const record = {
        id1: { name: 'Item 1' },
        id2: { name: 'Item 2' },
        id3: { name: 'Item 3' }
      };
      
      const result = pickRandomIdFromRecord(record);
      
      expect(['id1', 'id2', 'id3']).toContain(result);
    });

    it('當物件為空時應該返回 null', () => {
      const result = pickRandomIdFromRecord({});
      expect(result).toBeNull();
    });

    it('當輸入為 null 時應該返回 null', () => {
      const result = pickRandomIdFromRecord(null);
      expect(result).toBeNull();
    });

    it('當輸入為 undefined 時應該返回 null', () => {
      const result = pickRandomIdFromRecord(undefined);
      expect(result).toBeNull();
    });

    it('對於單一 key 的物件應該返回該 key', () => {
      const record = { onlyId: { data: 'test' } };
      const result = pickRandomIdFromRecord(record);
      
      expect(result).toBe('onlyId');
    });

    it('應該能夠處理數字 key', () => {
      const record = {
        '1': 'a',
        '2': 'b',
        '3': 'c'
      };
      
      const result = pickRandomIdFromRecord(record);
      
      expect(['1', '2', '3']).toContain(result);
    });

    it('多次調用應該可能返回不同的結果', () => {
      const record = {
        id1: 'a',
        id2: 'b',
        id3: 'c',
        id4: 'd',
        id5: 'e'
      };
      
      const results = new Set();
      for (let i = 0; i < 20; i++) {
        results.add(pickRandomIdFromRecord(record));
      }
      
      // 20 次調用應該至少得到 2 個不同的結果（理論上）
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('pickRandomFromArray', () => {
    it('應該從陣列中選擇一個元素', () => {
      const items = ['apple', 'banana', 'cherry'];
      const result = pickRandomFromArray(items);
      
      expect(items).toContain(result);
    });

    it('當陣列為空時應該返回 null', () => {
      const result = pickRandomFromArray([]);
      expect(result).toBeNull();
    });

    it('當輸入不是陣列時應該返回 null', () => {
      expect(pickRandomFromArray('not an array')).toBeNull();
      expect(pickRandomFromArray(null)).toBeNull();
      expect(pickRandomFromArray(undefined)).toBeNull();
      expect(pickRandomFromArray({})).toBeNull();
    });

    it('應該過濾掉 falsy 值', () => {
      const items = ['apple', null, 'banana', undefined, '', 'cherry', 0, false];
      const result = pickRandomFromArray(items);
      
      // 只應該返回非 falsy 的值
      expect(['apple', 'banana', 'cherry']).toContain(result);
    });

    it('對於單元素陣列應該返回該元素', () => {
      const result = pickRandomFromArray(['only-item']);
      expect(result).toBe('only-item');
    });

    it('應該處理數字陣列', () => {
      const items = [1, 2, 3, 4, 5];
      const result = pickRandomFromArray(items);
      
      expect(items).toContain(result);
      expect(typeof result).toBe('number');
    });

    it('應該處理物件陣列', () => {
      const items = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' }
      ];
      
      const result = pickRandomFromArray(items);
      
      expect(items).toContain(result);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
    });

    it('多次調用應該可能返回不同的結果', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const results = new Set();
      
      for (let i = 0; i < 30; i++) {
        results.add(pickRandomFromArray(items));
      }
      
      // 30 次調用應該至少得到 3 個不同的結果
      expect(results.size).toBeGreaterThanOrEqual(3);
    });

    it('應該正確處理只包含一個 falsy 值的陣列', () => {
      const result = pickRandomFromArray([0]);
      expect(result).toBeNull(); // 0 會被過濾掉
    });

    it('應該正確處理包含混合類型的陣列', () => {
      const items = [1, 'two', { three: 3 }, [4], true];
      const result = pickRandomFromArray(items);
      
      expect(items).toContain(result);
    });
  });

  describe('Integration Tests', () => {
    it('shuffleArray 和 pickRandomFromArray 應該能夠一起使用', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(original);
      const picked = pickRandomFromArray(shuffled);
      
      expect(original).toContain(picked);
    });

    it('多個函數應該正確處理空輸入', () => {
      expect(shuffleArray([])).toEqual([]);
      expect(pickRandomFromArray([])).toBeNull();
      expect(pickRandomIdFromRecord({})).toBeNull();
    });

    it('所有隨機函數都應該是穩定的（不拋出異常）', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          shuffleArray([1, 2, 3, 4, 5]);
          pickRandomFromArray([1, 2, 3, 4, 5]);
          pickRandomIdFromRecord({ a: 1, b: 2, c: 3 });
        }
      }).not.toThrow();
    });
  });
});

