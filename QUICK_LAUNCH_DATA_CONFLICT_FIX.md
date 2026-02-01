# 🚨 極速上架修復 - 資料衝突解決方案

> **錯誤**: `check constraint "sticker_sets_sticker_count_check" of relation "sticker_sets" is violated by some row`  
> **原因**: 資料庫中已存在不符合約束的記錄  
> **解決**: 先清理資料，再更新約束

---

## 📊 問題分析

### 為什麼會出現這個錯誤？

當您嘗試添加新的 CHECK 約束時，PostgreSQL 會檢查**所有現有記錄**是否符合新約束。如果有任何記錄不符合，就會拒絕添加約束。

**可能的原因**：
1. 資料庫中有 `sticker_count = NULL` 的記錄
2. 資料庫中有 `sticker_count = 0` 的記錄（極速上架失敗留下的）
3. 資料庫中有其他異常值（如 1, 2, 3, 6, 10 等）

---

## ⚡ 快速修復（分步執行）

### 步驟 1：檢查問題記錄

在 Supabase SQL Editor 執行：

```sql
-- 查看所有不符合的記錄
SELECT 
  id,
  set_id,
  name,
  style,
  sticker_count,
  status,
  created_at
FROM sticker_sets
WHERE sticker_count NOT IN (4, 8, 16, 24, 40)
   OR sticker_count IS NULL
ORDER BY created_at DESC;
```

**記錄結果**，看看有哪些問題記錄。

---

### 步驟 2：移除舊約束

```sql
-- 先移除現有約束
ALTER TABLE sticker_sets 
DROP CONSTRAINT IF EXISTS sticker_sets_sticker_count_check;
```

✅ 這一步應該會成功

---

### 步驟 3：修正問題資料

根據步驟 1 的檢查結果，選擇適當的修正方式：

#### 選項 A：修正 NULL 值（如果有）
```sql
UPDATE sticker_sets
SET sticker_count = 8
WHERE sticker_count IS NULL;
```

#### 選項 B：修正異常值（自動調整到最接近的有效值）
```sql
UPDATE sticker_sets
SET sticker_count = CASE
  WHEN sticker_count = 0 THEN 0  -- 保留極速上架的 0
  WHEN sticker_count <= 4 THEN 4
  WHEN sticker_count <= 8 THEN 8
  WHEN sticker_count <= 16 THEN 16
  WHEN sticker_count <= 24 THEN 24
  ELSE 40
END
WHERE sticker_count NOT IN (0, 4, 8, 16, 24, 40)
  AND sticker_count IS NOT NULL;
```

#### 選項 C：刪除測試/錯誤資料（謹慎使用！）
```sql
-- 只刪除草稿狀態且超過 1 天的異常記錄
DELETE FROM sticker_sets
WHERE sticker_count NOT IN (0, 4, 8, 16, 24, 40)
  AND status = 'draft'
  AND created_at < NOW() - INTERVAL '1 day';
```

---

### 步驟 4：確認無問題記錄

```sql
-- 應該返回 0 筆記錄
SELECT 
  COUNT(*) as problem_count
FROM sticker_sets
WHERE sticker_count NOT IN (0, 4, 8, 16, 24, 40)
   OR sticker_count IS NULL;
```

**預期結果**: `problem_count = 0`

---

### 步驟 5：添加新約束

```sql
-- 添加新約束（允許 0）
ALTER TABLE sticker_sets 
ADD CONSTRAINT sticker_sets_sticker_count_check 
CHECK (sticker_count IN (0, 4, 8, 16, 24, 40));
```

✅ 這次應該會成功！

---

### 步驟 6：驗證修復

```sql
-- 測試插入
INSERT INTO sticker_sets (
  set_id, user_id, name, style, sticker_count, status
) VALUES (
  'test-123', 'test-user', '測試', 'quick_launch_master', 0, 'draft'
);

-- 檢查（應該成功）
SELECT * FROM sticker_sets WHERE set_id = 'test-123';

-- 清理
DELETE FROM sticker_sets WHERE set_id = 'test-123';
```

---

## 🎯 推薦執行順序

### 方案 A：保守方案（推薦）

1. 執行步驟 1（檢查問題記錄）
2. 執行步驟 2（移除舊約束）
3. 執行步驟 3 選項 B（自動修正異常值）
4. 執行步驟 4（確認無問題）
5. 執行步驟 5（添加新約束）
6. 執行步驟 6（驗證）

### 方案 B：激進方案（如果是測試環境）

1. 執行步驟 2（移除舊約束）
2. 執行步驟 3 選項 C（刪除異常資料）
3. 執行步驟 5（添加新約束）
4. 執行步驟 6（驗證）

---

## 📁 完整腳本

我已經創建了完整的修復腳本：

```
database/FIX_QUICK_LAUNCH_WITH_DATA_CLEANUP.sql
```

這個腳本包含：
- ✅ 所有檢查步驟
- ✅ 多種修正選項
- ✅ 自動測試
- ✅ 詳細註解

**使用方式**：
1. 打開 Supabase SQL Editor
2. 複製整個腳本
3. **逐步執行**（不要一次全部執行）
4. 根據檢查結果選擇適當的修正方式

---

## 🔍 常見問題

### Q1: 如何知道哪些記錄有問題？

**A**: 執行步驟 1 的查詢，會列出所有不符合的記錄。

### Q2: 會不會刪除重要資料？

**A**: 
- 選項 A 和 B 只是**修正值**，不刪除記錄
- 選項 C 會刪除，但有條件限制（草稿 + 超過 1 天）
- 建議先用選項 B

### Q3: 如果修正後還是失敗？

**A**: 
1. 再次執行步驟 1 檢查
2. 確認 `problem_count = 0`
3. 檢查是否有其他約束衝突

### Q4: 可以直接刪除所有異常記錄嗎？

**A**: 可以，但要小心：
```sql
-- 查看會刪除哪些記錄
SELECT * FROM sticker_sets
WHERE sticker_count NOT IN (0, 4, 8, 16, 24, 40);

-- 確認後再刪除
DELETE FROM sticker_sets
WHERE sticker_count NOT IN (0, 4, 8, 16, 24, 40);
```

---

## 📊 修正策略對比

| 方案 | 優點 | 缺點 | 適用場景 |
|------|------|------|----------|
| **選項 A** | 安全，只處理 NULL | 不處理其他異常值 | NULL 值問題 |
| **選項 B** | 保留所有記錄，自動修正 | 可能改變原始值 | 生產環境 |
| **選項 C** | 徹底清理 | 會刪除資料 | 測試環境 |

---

## ✅ 執行檢查清單

- [ ] 步驟 1：檢查問題記錄（記錄結果）
- [ ] 步驟 2：移除舊約束
- [ ] 步驟 3：選擇並執行修正方式
- [ ] 步驟 4：確認 problem_count = 0
- [ ] 步驟 5：添加新約束
- [ ] 步驟 6：測試插入成功
- [ ] 在 LINE Bot 測試極速上架

---

## 🎯 預期結果

修復完成後：

```sql
-- 查看所有 sticker_count 的分布
SELECT 
  sticker_count,
  COUNT(*) as count
FROM sticker_sets
GROUP BY sticker_count
ORDER BY sticker_count;
```

**應該只看到**: 0, 4, 8, 16, 24, 40

---

## 📞 需要協助？

如果執行過程中遇到問題，請提供：

1. **步驟 1 的查詢結果**（有哪些問題記錄）
2. **錯誤訊息**（如果有）
3. **當前執行到哪一步**

---

**修復時間**: 10-15 分鐘  
**難度**: ⭐⭐⭐☆☆ (中等)  
**風險**: 🟡 中等（會修改資料，建議先檢查）

**Made with ❤️ by Sticker Tycoon Team**

