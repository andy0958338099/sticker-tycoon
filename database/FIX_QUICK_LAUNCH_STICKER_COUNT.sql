-- ========================================
-- 🔧 修復：極速上架功能的 sticker_count 約束問題
-- ========================================
-- 問題：quick_launch_master 設定 count: 0 違反資料庫約束
-- 錯誤：new row for relation "sticker_sets" violates check constraint "sticker_sets_sticker_count_check"
-- 原因：資料庫中存在 CHECK 約束，要求 sticker_count 必須是有效值
-- 解決：移除或修改約束，允許 0 值（用於 master 任務）
-- ========================================

-- 1️⃣ 檢查當前約束
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'sticker_sets'::regclass
  AND conname LIKE '%sticker_count%';

-- 2️⃣ 移除舊的 CHECK 約束（如果存在）
ALTER TABLE sticker_sets 
DROP CONSTRAINT IF EXISTS sticker_sets_sticker_count_check;

-- 3️⃣ 添加新的 CHECK 約束（允許 0 或有效值）
-- 0 = master 任務（極速上架）
-- 4, 8, 16, 24, 40 = 正常貼圖組
ALTER TABLE sticker_sets 
ADD CONSTRAINT sticker_sets_sticker_count_check 
CHECK (sticker_count IN (0, 4, 8, 16, 24, 40));

-- 4️⃣ 驗證約束已更新
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'sticker_sets'::regclass
  AND conname = 'sticker_sets_sticker_count_check';

-- 預期結果：
-- constraint_definition 應該包含 "CHECK ((sticker_count = ANY (ARRAY[0, 4, 8, 16, 24, 40])))"

-- 5️⃣ 測試插入 master 任務（應該成功）
-- 注意：這只是測試，實際插入由應用程式處理
DO $$
DECLARE
  test_set_id TEXT := 'test-' || gen_random_uuid()::text;
BEGIN
  -- 嘗試插入一個 count = 0 的測試記錄
  INSERT INTO sticker_sets (
    set_id,
    user_id,
    name,
    style,
    sticker_count,
    status
  ) VALUES (
    test_set_id,
    'test-user',
    '測試極速上架',
    'quick_launch_master',
    0,
    'draft'
  );
  
  RAISE NOTICE '✅ 測試成功：可以插入 sticker_count = 0 的記錄';
  
  -- 清理測試資料
  DELETE FROM sticker_sets WHERE set_id = test_set_id;
  RAISE NOTICE '🧹 測試資料已清理';
  
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE '❌ 測試失敗：仍然違反 CHECK 約束';
    RAISE NOTICE '錯誤訊息：%', SQLERRM;
END $$;

-- 6️⃣ 檢查現有的 quick_launch_master 記錄
SELECT 
  set_id,
  name,
  style,
  sticker_count,
  status,
  created_at
FROM sticker_sets
WHERE style = 'quick_launch_master'
ORDER BY created_at DESC
LIMIT 10;

-- ========================================
-- ✅ 完成後的測試步驟
-- ========================================
-- 1. 在 Supabase SQL Editor 執行此腳本
-- 2. 確認測試成功（看到 "✅ 測試成功" 訊息）
-- 3. 返回 LINE Bot，上傳照片觸發極速上架
-- 4. 檢查是否成功創建任務（不再出現約束錯誤）
-- 5. 監控 Netlify Functions 日誌，確認沒有錯誤
-- ========================================

-- 📝 備註：
-- - sticker_count = 0 僅用於 quick_launch_master 類型
-- - 實際的貼圖會在 3 個子任務中生成（每個 18 張）
-- - master 任務本身不生成貼圖，只是協調者
-- ========================================

