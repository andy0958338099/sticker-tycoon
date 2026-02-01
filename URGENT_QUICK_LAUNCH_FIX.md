# 🚨 極速上架緊急修復指南

> **狀態**: 代碼已修復，但資料庫尚未更新  
> **問題**: 資料庫不允許 `sticker_count = 54`  
> **解決**: 執行一鍵修復 SQL（1 分鐘）

---

## 🎯 問題現象

```
❌ 判斷任務類型失敗，改用預設生成流程: 
   new row for relation "sticker_sets" violates check constraint 
   "sticker_sets_sticker_count_check"

📋 最終表情列表 (0 個):
💰 本次生成需要 0 張（0張貼圖 = 0張數）
❌ 所有圖片生成失敗：API 錯誤
```

---

## ⚡ 一鍵修復（1 分鐘）

### 步驟 1：登入 Supabase

```
https://supabase.com/dashboard
→ 選擇您的專案
→ SQL Editor
→ New query
```

### 步驟 2：複製並執行以下 SQL

```sql
-- 移除舊約束
ALTER TABLE sticker_sets 
DROP CONSTRAINT IF EXISTS sticker_sets_sticker_count_check;

-- 修正異常資料
UPDATE sticker_sets
SET sticker_count = CASE
  WHEN sticker_count IS NULL THEN 8
  WHEN sticker_count = 0 THEN 0
  WHEN sticker_count <= 4 THEN 4
  WHEN sticker_count <= 8 THEN 8
  WHEN sticker_count <= 16 THEN 16
  WHEN sticker_count <= 24 THEN 24
  WHEN sticker_count <= 54 THEN 54
  ELSE 40
END
WHERE sticker_count NOT IN (0, 4, 8, 16, 24, 40, 54)
   OR sticker_count IS NULL;

-- 添加新約束（允許 54）
ALTER TABLE sticker_sets 
ADD CONSTRAINT sticker_sets_sticker_count_check 
CHECK (sticker_count IN (0, 4, 8, 16, 24, 40, 54));
```

### 步驟 3：確認成功

應該看到：
```
✅ 測試成功：可以插入 sticker_count = 54
🧹 測試資料已清理
```

---

## 🧪 測試極速上架

修復後立即測試：

1. 在 LINE Bot 輸入「創建貼圖」
2. 選擇「📸 照片轉貼圖」
3. 上傳照片
4. 等待「🚀 已啟動極速上架」

### 預期日誌

```
✅ 💰 待扣除 54 張（生成成功後扣除）
✅ 🚀 開始執行極速上架任務
✅ 開始生成第 1 組（18 張）
✅ 開始生成第 2 組（18 張）
✅ 開始生成第 3 組（18 張）
✅ 已回補 14 張
```

### 不應該看到

```
❌ violates check constraint
❌ 最終表情列表 (0 個)
❌ 所有圖片生成失敗
```

---

## 📊 為什麼會出現這個錯誤？

### 問題流程

```
1. 代碼已修復（count: 54, tokenCost: 54）✅
2. Netlify 已部署新代碼 ✅
3. 但資料庫約束還是舊的 ❌
   └─ 只允許：0, 4, 8, 16, 24, 40
   └─ 不允許：54

4. Worker 嘗試創建子任務（18 張）
   └─ 成功！（18 在允許範圍內）

5. Worker 嘗試創建 master 任務（54 張）
   └─ 失敗！（54 不在允許範圍內）
   └─ 退回到預設流程
   └─ 但 master 任務的 expressions = []
   └─ 生成 0 張 → 失敗
```

### 修復後流程

```
1. 資料庫允許 54 ✅
2. Worker 創建 master 任務（54 張）✅
3. Worker 執行 executeQuickLaunch ✅
4. 創建 3 個子任務（每個 18 張）✅
5. 依序生成 3 組貼圖 ✅
6. 扣除 54 張 ✅
7. 回補 14 張 ✅
8. 淨消耗 40 張 ✅
```

---

## 📁 相關文件

| 文件 | 用途 |
|------|------|
| `database/ONE_CLICK_QUICK_LAUNCH_FIX.sql` | 一鍵修復腳本 ⭐ |
| `database/FIX_QUICK_LAUNCH_STICKER_COUNT.sql` | 詳細修復腳本 |
| `database/FIX_QUICK_LAUNCH_WITH_DATA_CLEANUP.sql` | 完整清理腳本 |
| `QUICK_LAUNCH_TOKEN_COUNT_FIX.md` | 代碼修復說明 |

---

## ✅ 修復檢查清單

- [x] 代碼已修復（count: 54）
- [x] 代碼已推送到 GitHub
- [x] Netlify 已自動部署
- [ ] **執行資料庫修復 SQL** ← 您現在需要做這個！
- [ ] 在 LINE Bot 測試
- [ ] 確認日誌正常
- [ ] 確認生成 3 組貼圖
- [ ] 確認扣除 54 張
- [ ] 確認回補 14 張

---

## 🎯 立即行動

### 現在就執行！

1. 打開 Supabase SQL Editor
2. 複製上面的 SQL
3. 點擊 "Run"
4. 看到 "✅ 測試成功"
5. 在 LINE Bot 測試極速上架

**預計時間**: 1 分鐘  
**風險等級**: 🟢 低風險

---

## 📞 還有問題？

如果執行後還是失敗，請提供：
1. Supabase SQL 執行結果
2. Netlify Functions 完整日誌
3. LINE Bot 收到的訊息

---

**修復優先級**: 🔴 緊急（功能完全無法使用）  
**預計修復時間**: 1 分鐘  
**需要重啟**: ❌ 不需要

**Made with ❤️ by Sticker Tycoon Team**

