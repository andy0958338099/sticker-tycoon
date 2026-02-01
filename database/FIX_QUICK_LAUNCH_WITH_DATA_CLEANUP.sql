-- ========================================
-- 🔧 修復：極速上架功能 - 處理現有資料衝突
-- ========================================
-- 錯誤：check constraint "sticker_sets_sticker_count_check" of relation "sticker_sets" is violated by some row
-- 原因：資料庫中已存在 sticker_count 不符合約束的記錄
-- 解決：先檢查並修正現有資料，再更新約束
-- ========================================

-- 步驟 1️⃣：檢查現有的問題記錄
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
ORDER BY created_at DESC;

-- 📝 記錄結果，看看有哪些不符合的記錄

-- 步驟 2️⃣：檢查是否有 NULL 值
SELECT 
  id,
  set_id,
  name,
  sticker_count,
  status
FROM sticker_sets
WHERE sticker_count IS NULL;

-- 步驟 3️⃣：先移除現有約束（如果存在）
ALTER TABLE sticker_sets 
DROP CONSTRAINT IF EXISTS sticker_sets_sticker_count_check;

-- 步驟 4️⃣：修正問題資料
-- 選項 A：將 sticker_count = 0 的記錄保留（極速上架 master 任務）
-- 選項 B：將其他異常值修正為最接近的有效值
-- 選項 C：刪除測試/錯誤資料

-- 4A. 檢查 sticker_count = 0 的記錄（極速上架）
SELECT 
  id,
  set_id,
  name,
  style,
  sticker_count,
  status,
  created_at
FROM sticker_sets
WHERE sticker_count = 0;

-- 4B. 檢查其他異常值
SELECT 
  id,
  set_id,
  name,
  style,
  sticker_count,
  status,
  created_at
FROM sticker_sets
WHERE sticker_count NOT IN (0, 4, 8, 16, 24, 40)
  AND sticker_count IS NOT NULL;

-- 步驟 5️⃣：修正異常資料
-- 根據上面的檢查結果，選擇適當的修正方式

-- 方案 A：修正 NULL 值為預設值 8
UPDATE sticker_sets
SET sticker_count = 8
WHERE sticker_count IS NULL;

-- 方案 B：修正異常值（例如 1, 2, 3 → 4）
UPDATE sticker_sets
SET sticker_count = CASE
  WHEN sticker_count <= 4 THEN 4
  WHEN sticker_count <= 8 THEN 8
  WHEN sticker_count <= 16 THEN 16
  WHEN sticker_count <= 24 THEN 24
  ELSE 40
END
WHERE sticker_count NOT IN (0, 4, 8, 16, 24, 40)
  AND sticker_count IS NOT NULL;

-- 方案 C：刪除測試資料（謹慎使用！）
-- DELETE FROM sticker_sets
-- WHERE sticker_count NOT IN (0, 4, 8, 16, 24, 40)
--   AND status = 'draft'
--   AND created_at < NOW() - INTERVAL '1 day';

-- 步驟 6️⃣：再次檢查是否還有問題記錄
SELECT 
  COUNT(*) as problem_count,
  sticker_count
FROM sticker_sets
WHERE sticker_count NOT IN (0, 4, 8, 16, 24, 40)
   OR sticker_count IS NULL
GROUP BY sticker_count;

-- 預期結果：problem_count = 0

-- 步驟 7️⃣：添加新的約束（允許 0）
ALTER TABLE sticker_sets 
ADD CONSTRAINT sticker_sets_sticker_count_check 
CHECK (sticker_count IN (0, 4, 8, 16, 24, 40));

-- 步驟 8️⃣：驗證約束已成功添加
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'sticker_sets'::regclass
  AND conname = 'sticker_sets_sticker_count_check';

-- 預期結果：
-- CHECK ((sticker_count = ANY (ARRAY[0, 4, 8, 16, 24, 40])))

-- 步驟 9️⃣：測試插入（應該成功）
DO $$
DECLARE
  test_set_id TEXT := 'test-' || gen_random_uuid()::text;
BEGIN
  -- 測試 count = 0
  INSERT INTO sticker_sets (
    set_id, user_id, name, style, sticker_count, status
  ) VALUES (
    test_set_id, 'test-user', '測試極速上架', 'quick_launch_master', 0, 'draft'
  );
  
  RAISE NOTICE '✅ 測試成功：可以插入 sticker_count = 0';
  
  -- 清理
  DELETE FROM sticker_sets WHERE set_id = test_set_id;
  RAISE NOTICE '🧹 測試資料已清理';
  
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE '❌ 測試失敗：%', SQLERRM;
  WHEN OTHERS THEN
    RAISE NOTICE '❌ 其他錯誤：%', SQLERRM;
END $$;

-- 步驟 🔟：最終檢查所有記錄
SELECT 
  sticker_count,
  COUNT(*) as count,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM sticker_sets
GROUP BY sticker_count
ORDER BY sticker_count;

-- ========================================
-- ✅ 完成檢查清單
-- ========================================
-- [ ] 步驟 1：檢查問題記錄（記錄結果）
-- [ ] 步驟 2：檢查 NULL 值
-- [ ] 步驟 3：移除舊約束
-- [ ] 步驟 4：分析問題資料
-- [ ] 步驟 5：修正異常資料
-- [ ] 步驟 6：確認無問題記錄
-- [ ] 步驟 7：添加新約束
-- [ ] 步驟 8：驗證約束
-- [ ] 步驟 9：測試插入
-- [ ] 步驟 10：最終檢查
-- ========================================

-- 📝 注意事項：
-- 1. 先執行步驟 1-2 檢查資料
-- 2. 根據檢查結果決定修正方式
-- 3. 如果是生產環境，建議先備份資料
-- 4. 謹慎使用 DELETE 操作
-- ========================================

