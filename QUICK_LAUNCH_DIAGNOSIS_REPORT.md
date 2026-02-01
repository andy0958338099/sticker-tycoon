# 🔍 極速上架功能完整診斷報告

> **日期**: 2026-02-01  
> **狀態**: 診斷中，等待下次測試  
> **問題**: 極速上架走到預設流程，導致生成 0 張

---

## 📊 問題現象

### 錯誤日誌
```
📋 expressions JSON: []
📋 最終表情列表 (0 個):
💰 本次生成需要 0 張（0張貼圖 = 0張數）
❌ 所有圖片生成失敗：API 錯誤
```

### 問題分析

1. **Master 任務創建成功**
   - `count: 54` ✅
   - `tokenCost: 54` ✅
   - `taskType: 'quick_launch'` ✅
   - `expressions: []` ⚠️ (這是正常的，master 不需要表情)

2. **Worker 路由錯誤**
   - 應該執行：`executeQuickLaunch(taskId, setId)`
   - 實際執行：`executeGeneration(taskId, setId)`
   - 原因：未知（需要更多日誌）

3. **預設流程失敗**
   - `executeGeneration` 讀取 master 任務
   - `expressions: []` → 生成 0 張
   - 失敗：所有圖片生成失敗

---

## 🔧 已完成的修復

### 1. 代碼修復 ✅

| 文件 | 修改 | 狀態 |
|------|------|------|
| `functions/line-webhook.js` | `count: 0` → `count: 54` | ✅ |
| `functions/line-webhook.js` | `tokenCost: 0` → `tokenCost: 54` | ✅ |
| `functions/sticker-generator-worker-background.js` | 使用 `??` 代替 `||` | ✅ |
| `functions/sticker-generator-worker-background.js` | 增強路由診斷日誌 | ✅ |

### 2. 資料庫修復 ⚠️

**狀態**: 需要手動執行

**SQL 腳本**: `database/ONE_CLICK_QUICK_LAUNCH_FIX.sql`

```sql
-- 允許 sticker_count = 54
ALTER TABLE sticker_sets 
DROP CONSTRAINT IF EXISTS sticker_sets_sticker_count_check;

ALTER TABLE sticker_sets 
ADD CONSTRAINT sticker_sets_sticker_count_check 
CHECK (sticker_count IN (0, 4, 8, 16, 24, 40, 54));
```

---

## 🎯 下次測試時的預期日誌

### 如果修復成功

```
✅ 📋 任務類型：quick_launch
✅ 🚀 執行極速上架流程
✅ 🚀 開始執行極速上架任務
✅ 開始生成第 1 組（18 張）
✅ 開始生成第 2 組（18 張）
✅ 開始生成第 3 組（18 張）
✅ 已回補 14 張
```

### 如果還是失敗

```
❌ 📋 任務類型：(無) 或其他值
❌ 📝 執行預設生成流程
❌ 📋 最終表情列表 (0 個)
```

**如果看到這個**，請提供完整日誌，包括：
- `📋 任務類型：` 的值
- 任何錯誤訊息

---

## 🔍 可能的問題原因

### 原因 1：資料庫約束未更新 ⚠️

**症狀**：
```
❌ 判斷任務類型失敗，改用預設生成流程: 
   new row for relation "sticker_sets" violates check constraint
```

**解決**：執行 `database/ONE_CLICK_QUICK_LAUNCH_FIX.sql`

### 原因 2：task_type 未正確保存

**症狀**：
```
📋 任務類型：(無)
📝 執行預設生成流程
```

**可能原因**：
- `createGenerationTask` 中 `task_type` 欄位名稱錯誤
- 資料庫表結構問題

**檢查**：
```sql
SELECT task_id, task_type, status 
FROM generation_tasks 
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC 
LIMIT 5;
```

### 原因 3：查詢失敗

**症狀**：
```
❌ 查詢任務類型失敗: [錯誤訊息]
❌ 判斷任務類型失敗，改用預設生成流程
```

**可能原因**：
- Supabase 連線問題
- 權限問題
- 表結構問題

---

## 📝 診斷步驟

### 步驟 1：執行資料庫修復

```sql
-- 在 Supabase SQL Editor 執行
ALTER TABLE sticker_sets 
DROP CONSTRAINT IF EXISTS sticker_sets_sticker_count_check;

ALTER TABLE sticker_sets 
ADD CONSTRAINT sticker_sets_sticker_count_check 
CHECK (sticker_count IN (0, 4, 8, 16, 24, 40, 54));
```

### 步驟 2：等待 Netlify 部署完成

檢查：https://app.netlify.com/sites/YOUR_SITE/deploys

### 步驟 3：在 LINE Bot 測試

1. 輸入「創建貼圖」
2. 選擇「📸 照片轉貼圖」
3. 上傳照片

### 步驟 4：檢查 Netlify 日誌

尋找以下關鍵日誌：

```
📋 任務類型：quick_launch  ← 這個很重要！
🚀 執行極速上架流程
```

### 步驟 5：如果還是失敗

提供以下資訊：
1. 完整的 Netlify Functions 日誌
2. `📋 任務類型：` 顯示的值
3. 資料庫查詢結果：
   ```sql
   SELECT * FROM generation_tasks 
   WHERE task_id = 'YOUR_TASK_ID';
   ```

---

## 🎯 預期修復效果

### 修復前
```
1. 創建 master 任務 (count: 54, taskType: 'quick_launch')
2. Worker 查詢 task_type
3. 因某種原因失敗或返回錯誤值
4. 退回到 executeGeneration
5. 讀取 master 任務 (expressions: [])
6. 生成 0 張 → 失敗
```

### 修復後
```
1. 創建 master 任務 (count: 54, taskType: 'quick_launch')
2. Worker 查詢 task_type = 'quick_launch' ✅
3. 執行 executeQuickLaunch ✅
4. 創建 3 個子任務 (每個 18 張) ✅
5. 依序生成 3 組貼圖 ✅
6. 扣除 54 張，回補 14 張 ✅
```

---

## 📁 相關文件

| 文件 | 用途 |
|------|------|
| `database/ONE_CLICK_QUICK_LAUNCH_FIX.sql` | 資料庫一鍵修復 ⭐ |
| `URGENT_QUICK_LAUNCH_FIX.md` | 緊急修復指南 |
| `QUICK_LAUNCH_TOKEN_COUNT_FIX.md` | 張數計算修復 |
| `QUICK_LAUNCH_DATA_CONFLICT_FIX.md` | 資料衝突解決 |

---

## ✅ 檢查清單

- [x] 代碼修復（count, tokenCost）
- [x] 使用 ?? 運算符
- [x] 增強診斷日誌
- [x] 推送到 GitHub
- [x] Netlify 自動部署
- [ ] **執行資料庫修復 SQL** ← 必須執行！
- [ ] 在 LINE Bot 測試
- [ ] 檢查日誌中的「任務類型」
- [ ] 確認執行極速上架流程
- [ ] 確認生成 3 組貼圖

---

## 📞 需要協助？

如果下次測試還是失敗，請提供：

1. **完整的 Netlify Functions 日誌**（從開始到結束）
2. **關鍵日誌行**：
   - `📋 任務類型：` 的值
   - `🚀 執行極速上架流程` 或 `📝 執行預設生成流程`
   - 任何錯誤訊息
3. **資料庫查詢結果**：
   ```sql
   SELECT task_id, task_type, status, created_at
   FROM generation_tasks
   WHERE user_id = 'YOUR_USER_ID'
   ORDER BY created_at DESC
   LIMIT 3;
   ```

---

**診斷狀態**: 🟡 等待測試  
**預計修復時間**: 1-5 分鐘（取決於問題原因）  
**下次行動**: 執行資料庫修復 SQL，然後測試

**Made with ❤️ by Sticker Tycoon Team**

