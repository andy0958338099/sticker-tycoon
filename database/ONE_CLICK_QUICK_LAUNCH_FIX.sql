-- ========================================
-- 🚀 極速上架功能 - 一鍵修復腳本
-- ========================================
-- 執行時間：1 分鐘
-- 風險：低（只是放寬約束和清理資料）
-- ========================================

-- 步驟 1：移除舊約束
ALTER TABLE sticker_sets 
DROP CONSTRAINT IF EXISTS sticker_sets_sticker_count_check;

-- 步驟 2：修正所有異常資料
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

-- 步驟 3：添加新約束（允許 0, 4, 8, 16, 24, 40, 54）
ALTER TABLE sticker_sets 
ADD CONSTRAINT sticker_sets_sticker_count_check 
CHECK (sticker_count IN (0, 4, 8, 16, 24, 40, 54));

-- 步驟 4：驗證（應該返回 "Success!"）
DO $$
DECLARE
  test_set_id TEXT := 'test-' || gen_random_uuid()::text;
BEGIN
  -- 測試插入 count = 54
  INSERT INTO sticker_sets (
    set_id, user_id, name, style, sticker_count, status
  ) VALUES (
    test_set_id, 'test-user', '測試極速上架', 'quick_launch_master', 54, 'draft'
  );
  
  RAISE NOTICE '✅ 測試成功：可以插入 sticker_count = 54';
  
  -- 清理測試資料
  DELETE FROM sticker_sets WHERE set_id = test_set_id;
  RAISE NOTICE '🧹 測試資料已清理';
  
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE '❌ 測試失敗：仍然違反 CHECK 約束';
    RAISE NOTICE '錯誤訊息：%', SQLERRM;
  WHEN OTHERS THEN
    RAISE NOTICE '❌ 其他錯誤：%', SQLERRM;
END $$;

-- 步驟 5：顯示當前約束
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'sticker_sets'::regclass
  AND conname = 'sticker_sets_sticker_count_check';

-- 預期結果：
-- CHECK ((sticker_count = ANY (ARRAY[0, 4, 8, 16, 24, 40, 54])))

-- ========================================
-- ✅ 完成！
-- ========================================
-- 如果看到 "✅ 測試成功"，表示修復完成
-- 現在可以在 LINE Bot 測試極速上架功能
-- ========================================

