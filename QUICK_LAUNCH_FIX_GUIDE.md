# 🔧 爆量出圖功能修復指南

## 📋 問題描述

### 錯誤訊息
```
❌ 建立任務失敗: {
  code: '23514',
  message: 'new row for relation "sticker_sets" violates check constraint "sticker_sets_sticker_count_check"'
}
```

### 問題原因
1. **資料庫約束衝突**：`sticker_sets` 表有一個 CHECK 約束，限制 `sticker_count` 只能是 `4, 8, 16, 24, 40`
2. **代碼設計**：爆量出圖功能使用 `quick_launch_master` 類型，設定 `count: 0`（因為它是協調者，不直接生成貼圖）
3. **衝突點**：0 不在允許的值列表中，導致插入失敗

### 影響範圍
- ❌ 爆量出圖功能無法使用
- ✅ 其他正常創建流程不受影響

---

## 🛠️ 修復步驟

### 步驟 1：執行 SQL 修復腳本

1. **登入 Supabase Dashboard**
   ```
   https://supabase.com/dashboard
   ```

2. **開啟 SQL Editor**
   - 左側選單 → SQL Editor
   - 點擊 "New query"

3. **執行修復腳本**
   - 複製 `database/FIX_QUICK_LAUNCH_STICKER_COUNT.sql` 的內容
   - 貼上到 SQL Editor
   - 點擊 "Run" 執行

4. **確認修復成功**
   - 應該看到 `✅ 測試成功：可以插入 sticker_count = 0 的記錄`
   - 應該看到 `🧹 測試資料已清理`

### 步驟 2：驗證修復

1. **檢查約束**
   ```sql
   SELECT 
     conname AS constraint_name,
     pg_get_constraintdef(oid) AS constraint_definition
   FROM pg_constraint
   WHERE conrelid = 'sticker_sets'::regclass
     AND conname = 'sticker_sets_sticker_count_check';
   ```

   **預期結果**：
   ```
   CHECK ((sticker_count = ANY (ARRAY[0, 4, 8, 16, 24, 40])))
   ```

2. **測試插入**
   ```sql
   -- 測試插入 count = 0 的記錄
   INSERT INTO sticker_sets (
     set_id, user_id, name, style, sticker_count, status
   ) VALUES (
     'test-123', 'test-user', '測試', 'quick_launch_master', 0, 'draft'
   );
   
   -- 檢查
   SELECT * FROM sticker_sets WHERE set_id = 'test-123';
   
   -- 清理
   DELETE FROM sticker_sets WHERE set_id = 'test-123';
   ```

### 步驟 3：測試爆量出圖功能

1. **在 LINE Bot 中測試**
   - 輸入「創建貼圖」
   - 選擇「📸 照片轉貼圖」
   - 上傳一張照片
   - 等待爆量出圖啟動

2. **檢查 Netlify Functions 日誌**
   ```
   Netlify Dashboard → Functions → line-webhook → Function log
   ```

   **應該看到**：
   ```
   ✅ 對話狀態更新成功
   🚀 偵測到 quick_launch 模式，照片上傳後直接啟動爆量出圖
   💰 待扣除 54 張（生成成功後扣除）
   🎭 生成角色 ID: xxx
   ✅ 建立任務成功
   ```

   **不應該看到**：
   ```
   ❌ 建立任務失敗: violates check constraint
   ```

3. **檢查資料庫**
   ```sql
   SELECT 
     set_id, name, style, sticker_count, status, created_at
   FROM sticker_sets
   WHERE style = 'quick_launch_master'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

---

## 🔍 技術細節

### 修改前的約束
```sql
CHECK (sticker_count IN (4, 8, 16, 24, 40))
```

### 修改後的約束
```sql
CHECK (sticker_count IN (0, 4, 8, 16, 24, 40))
```

### 為什麼需要 0？
- **quick_launch_master** 是一個協調任務，不直接生成貼圖
- 它會創建 3 個子任務，每個生成 18 張貼圖
- master 任務本身的 `sticker_count = 0` 表示它不包含實際貼圖
- 子任務會有正常的 `sticker_count = 18`

### 代碼邏輯
```javascript
// line-webhook.js (第 73 行和第 211 行)
const masterSetData = {
  name: '爆量出圖',
  style: 'quick_launch_master',
  count: 0,  // ← 這裡設為 0
  // ... 其他設定
};
```

---

## 📊 驗證清單

執行修復後，請確認以下項目：

- [ ] SQL 腳本執行成功
- [ ] 測試訊息顯示 "✅ 測試成功"
- [ ] 約束定義包含 `0` 值
- [ ] 可以手動插入 `sticker_count = 0` 的記錄
- [ ] LINE Bot 爆量出圖功能可以啟動
- [ ] Netlify Functions 日誌沒有約束錯誤
- [ ] 資料庫中可以看到 `quick_launch_master` 記錄

---

## 🚨 常見問題

### Q1: 執行 SQL 時出現權限錯誤？
**A**: 確保使用的是 `service_role` 權限，或在 Supabase Dashboard 的 SQL Editor 中執行。

### Q2: 約束還是存在問題？
**A**: 檢查是否有多個約束：
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'sticker_sets'::regclass;
```

### Q3: 修復後還是失敗？
**A**: 
1. 檢查 Netlify 環境變數是否正確
2. 重新部署 Functions（可能需要重啟）
3. 檢查是否有快取問題

### Q4: 會影響現有資料嗎？
**A**: 不會。此修復只是放寬約束，不會修改或刪除現有資料。

---

## 📝 相關文件

- `database/FIX_QUICK_LAUNCH_STICKER_COUNT.sql` - SQL 修復腳本
- `functions/line-webhook.js` (第 73, 211 行) - 爆量出圖代碼
- `database/archive/supabase-schema.sql` - 原始資料庫結構

---

## 🎯 預期結果

修復完成後：

1. ✅ 爆量出圖功能正常運作
2. ✅ 可以創建 `quick_launch_master` 任務
3. ✅ 3 個子任務會依序生成（每個 18 張）
4. ✅ 用戶會收到進度通知
5. ✅ 完成後會回補 14 張（淨消耗 40 張）

---

## 📞 需要協助？

如果修復後仍有問題，請提供：
1. Netlify Functions 完整日誌
2. Supabase SQL Editor 執行結果
3. 錯誤訊息截圖

---

**修復時間**: 約 5 分鐘  
**難度**: ⭐⭐☆☆☆ (簡單)  
**影響範圍**: 僅爆量出圖功能  
**風險等級**: 🟢 低風險（只是放寬約束）

**Made with ❤️ by Sticker Tycoon Team**

