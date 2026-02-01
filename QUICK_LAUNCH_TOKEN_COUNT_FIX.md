# 🔧 極速上架功能修復 - 張數計算錯誤

> **問題**: 極速上架只扣除 6 張，而不是 54 張  
> **狀態**: ✅ 已修復  
> **修復時間**: 2026-02-01

---

## 📊 問題分析

### 錯誤現象
```
日誌顯示：💰 待扣除 6 張（生成成功後扣除）
預期應該：💰 待扣除 54 張（生成成功後扣除）
```

### 根本原因

**問題 1：JavaScript falsy 值判斷**

在 `sticker-generator-worker-background.js` 第 24 行：
```javascript
const stickerCount = setData.count || 6;
const tokenCost = setData.tokenCost || stickerCount;
```

當極速上架傳入 `count: 0` 和 `tokenCost: 0` 時：
- `0 || 6` → 返回 `6`（因為 0 是 falsy）
- 導致錯誤計算為 6 張

**問題 2：Master 任務設置錯誤**

在 `line-webhook.js` 第 73 行和第 211 行：
```javascript
const masterSetData = {
  count: 0,        // ❌ 錯誤：應該是 54
  tokenCost: 0,    // ❌ 錯誤：應該是 54
  // ...
};
```

---

## ✅ 修復方案

### 修復 1：使用 Nullish Coalescing Operator

**文件**: `functions/sticker-generator-worker-background.js`  
**位置**: 第 24-31 行

**修改前**：
```javascript
const stickerCount = setData.count || 6;
const tokenCost = setData.tokenCost || stickerCount;
console.log(`💰 待扣除 ${tokenCost} 張（生成成功後扣除）`);
```

**修改後**：
```javascript
// ⚠️ 使用 ?? 而不是 || 來避免 0 被當作 falsy
const stickerCount = setData.count ?? 6;
const tokenCost = setData.tokenCost ?? stickerCount;

// 🚀 極速上架：count=54, tokenCost=54（master 任務會扣除總張數）
if (tokenCost > 0) {
  console.log(`💰 待扣除 ${tokenCost} 張（生成成功後扣除）`);
} else {
  console.log(`📋 Master 任務（count=${stickerCount}, tokenCost=${tokenCost}），不扣除張數`);
}
```

**說明**：
- `??` (Nullish Coalescing) 只在值為 `null` 或 `undefined` 時使用預設值
- `||` (Logical OR) 在值為任何 falsy 值（0, false, '', null, undefined）時都使用預設值

### 修復 2：正確設置 Master 任務張數

**文件**: `functions/line-webhook.js`  
**位置**: 第 73 行和第 211 行（兩處）

**修改前**：
```javascript
const masterSetData = {
  name: '極速上架',
  style: 'quick_launch_master',
  count: 0,        // ❌ 錯誤
  tokenCost: 0,    // ❌ 錯誤
  // ...
};
```

**修改後**：
```javascript
const masterSetData = {
  name: '極速上架',
  style: 'quick_launch_master',
  count: totalCount,      // ✅ 修正：54 張
  tokenCost: totalCount,  // ✅ 修正：54 張
  // ...
};
```

---

## 🎯 修復效果

### 修復前
```
1. 用戶上傳照片
2. 系統創建 master 任務（count: 0, tokenCost: 0）
3. Worker 計算：0 || 6 = 6
4. 日誌顯示：💰 待扣除 6 張
5. 實際扣除：6 張 ❌
```

### 修復後
```
1. 用戶上傳照片
2. 系統創建 master 任務（count: 54, tokenCost: 54）
3. Worker 計算：54 ?? 6 = 54
4. 日誌顯示：💰 待扣除 54 張
5. 實際扣除：54 張 ✅
6. 完成後回補：14 張
7. 淨消耗：40 張 ✅
```

---

## 📝 技術細節

### JavaScript Falsy 值

| 值 | `|| 6` 結果 | `?? 6` 結果 |
|----|------------|------------|
| `0` | `6` ❌ | `0` ✅ |
| `null` | `6` ✅ | `6` ✅ |
| `undefined` | `6` ✅ | `6` ✅ |
| `false` | `6` | `false` |
| `''` | `6` | `''` |

### 極速上架流程

```
Master 任務 (count: 54, tokenCost: 54)
├── 預扣 54 張（檢查餘額）
├── 子任務 1 (18 張) - 風格 A
├── 子任務 2 (18 張) - 風格 B
├── 子任務 3 (18 張) - 風格 C
└── 完成後回補 14 張
    → 淨消耗 40 張
```

---

## 🧪 測試驗證

### 測試步驟

1. **在 LINE Bot 測試**
   - 輸入「創建貼圖」
   - 選擇「📸 照片轉貼圖」
   - 上傳照片

2. **檢查 Netlify 日誌**
   ```
   應該看到：
   ✅ 💰 待扣除 54 張（生成成功後扣除）
   
   不應該看到：
   ❌ 💰 待扣除 6 張（生成成功後扣除）
   ```

3. **檢查資料庫**
   ```sql
   SELECT 
     set_id, name, style, sticker_count, tokens_used, status
   FROM sticker_sets
   WHERE style = 'quick_launch_master'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   
   **預期結果**：
   - `sticker_count`: 54
   - `tokens_used`: 54

4. **檢查張數交易**
   ```sql
   SELECT 
     amount, balance_after, description
   FROM token_transactions
   WHERE user_id = 'YOUR_USER_ID'
   ORDER BY created_at DESC
   LIMIT 5;
   ```
   
   **預期結果**：
   - 扣除 54 張
   - 回補 14 張
   - 淨消耗 40 張

---

## 📁 修改文件

| 文件 | 修改內容 | 行數 |
|------|---------|------|
| `functions/sticker-generator-worker-background.js` | 使用 `??` 運算符 | 24-31 |
| `functions/line-webhook.js` | 修正 count 和 tokenCost | 73, 211 |

---

## ✅ 驗證清單

- [x] 修改 `sticker-generator-worker-background.js`
- [x] 修改 `line-webhook.js` (第 73 行)
- [x] 修改 `line-webhook.js` (第 211 行)
- [ ] 推送到 GitHub
- [ ] Netlify 自動部署
- [ ] 在 LINE Bot 測試
- [ ] 檢查日誌顯示 54 張
- [ ] 檢查實際扣除 54 張
- [ ] 檢查回補 14 張
- [ ] 確認淨消耗 40 張

---

## 🎓 學習要點

### 1. JavaScript 運算符選擇

**使用 `||` 的場景**：
```javascript
const name = userName || 'Guest';  // 空字串也使用預設值
```

**使用 `??` 的場景**：
```javascript
const count = userCount ?? 10;  // 只有 null/undefined 使用預設值
const price = itemPrice ?? 0;   // 0 是有效值
```

### 2. 數值 0 的處理

在業務邏輯中，`0` 通常是有效值：
- 數量：0 件
- 價格：0 元（免費）
- 張數：0 張（master 任務）

使用 `||` 會錯誤地將 0 當作「無效值」。

### 3. 極速上架設計

**為什麼 Master 任務需要設置 count?**

雖然 master 任務本身不生成貼圖，但需要：
1. 記錄總張數（54）用於預扣檢查
2. 記錄總成本（54）用於日誌顯示
3. 在資料庫中正確記錄 `tokens_used`

---

## 📞 相關問題

### Q1: 為什麼之前設置為 0？

**A**: 原始設計認為 master 任務不生成貼圖，所以設為 0。但這導致了張數計算錯誤。

### Q2: 會影響現有資料嗎？

**A**: 不會。此修復只影響新創建的極速上架任務。

### Q3: 需要修改資料庫約束嗎？

**A**: 需要！請先執行 `database/FIX_QUICK_LAUNCH_STICKER_COUNT.sql` 允許 `sticker_count = 54`。

---

**修復時間**: 約 10 分鐘  
**難度**: ⭐⭐⭐☆☆ (中等)  
**影響範圍**: 僅極速上架功能  
**風險等級**: 🟢 低風險（邏輯修正）

**Made with ❤️ by Sticker Tycoon Team**

