# 🚨 極速上架功能錯誤修復總結

> **問題**: 極速上架功能無法創建任務  
> **錯誤**: `violates check constraint "sticker_sets_sticker_count_check"`  
> **狀態**: ✅ 已識別問題，修復方案已準備  
> **修復時間**: 5 分鐘

---

## 📊 問題分析

### 錯誤日誌
```
Feb 1, 10:23:23 AM: ❌ 建立任務失敗: {
  code: '23514',
  message: 'new row for relation "sticker_sets" violates check constraint "sticker_sets_sticker_count_check"'
}
```

### 根本原因
| 項目 | 說明 |
|------|------|
| **資料庫約束** | `sticker_count` 只允許 `4, 8, 16, 24, 40` |
| **代碼設計** | 極速上架使用 `count: 0`（master 任務不直接生成貼圖） |
| **衝突** | 0 不在允許值中 → 插入失敗 |

### 代碼位置
```javascript
// functions/line-webhook.js (第 73 行)
const masterSetData = {
  name: '極速上架',
  style: 'quick_launch_master',
  count: 0,  // ← 問題在這裡
  // ...
};
```

---

## ⚡ 快速修復（3 步驟）

### 1️⃣ 登入 Supabase
```
https://supabase.com/dashboard
→ 選擇專案
→ SQL Editor
→ New query
```

### 2️⃣ 執行修復 SQL
複製並執行 `database/FIX_QUICK_LAUNCH_STICKER_COUNT.sql`

**或直接執行**：
```sql
-- 移除舊約束
ALTER TABLE sticker_sets 
DROP CONSTRAINT IF EXISTS sticker_sets_sticker_count_check;

-- 添加新約束（允許 0）
ALTER TABLE sticker_sets 
ADD CONSTRAINT sticker_sets_sticker_count_check 
CHECK (sticker_count IN (0, 4, 8, 16, 24, 40));
```

### 3️⃣ 驗證修復
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

✅ **如果沒有錯誤 → 修復成功！**

---

## 📁 相關文件

| 文件 | 用途 |
|------|------|
| `database/FIX_QUICK_LAUNCH_STICKER_COUNT.sql` | 完整修復腳本（含測試） |
| `QUICK_LAUNCH_FIX_GUIDE.md` | 詳細修復指南 |
| `functions/line-webhook.js` (第 73, 211 行) | 問題代碼位置 |

---

## 🧪 測試步驟

修復後，在 LINE Bot 中測試：

1. 輸入「創建貼圖」
2. 選擇「📸 照片轉貼圖」
3. 上傳照片
4. 等待「🚀 已啟動極速上架」訊息

**預期結果**：
- ✅ 收到啟動訊息
- ✅ 可以查詢進度
- ✅ Netlify 日誌沒有錯誤

---

## 🔍 技術說明

### 為什麼 count = 0？

極速上架採用 **Master-Worker 模式**：

```
Master 任務 (count = 0)
├── 子任務 1 (18 張) - 風格 A
├── 子任務 2 (18 張) - 風格 B  
└── 子任務 3 (18 張) - 風格 C
```

- **Master** 只是協調者，不生成貼圖 → `count = 0`
- **子任務** 實際生成貼圖 → `count = 18`

### 修改內容

**修改前**：
```sql
CHECK (sticker_count IN (4, 8, 16, 24, 40))
```

**修改後**：
```sql
CHECK (sticker_count IN (0, 4, 8, 16, 24, 40))
```

---

## ✅ 驗證清單

- [ ] SQL 腳本執行成功
- [ ] 測試插入成功（無錯誤）
- [ ] LINE Bot 極速上架可啟動
- [ ] Netlify 日誌正常
- [ ] 可以查詢進度

---

## 🎯 影響評估

| 項目 | 影響 |
|------|------|
| **極速上架** | ✅ 修復後可用 |
| **正常創建** | ✅ 不受影響 |
| **現有資料** | ✅ 不受影響 |
| **其他功能** | ✅ 不受影響 |

**風險等級**: 🟢 低風險（只是放寬約束）

---

## 📞 問題排查

### 如果修復後還是失敗？

1. **檢查約束是否更新**
   ```sql
   SELECT pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'sticker_sets'::regclass
     AND conname = 'sticker_sets_sticker_count_check';
   ```

2. **檢查 Netlify 環境變數**
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

3. **重新部署 Functions**
   ```bash
   git push origin main
   ```

4. **查看完整日誌**
   - Netlify Dashboard → Functions → line-webhook → Function log

---

## 📚 延伸閱讀

- [PostgreSQL CHECK Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)
- [Supabase SQL Editor](https://supabase.com/docs/guides/database/overview)
- [Netlify Functions Logs](https://docs.netlify.com/functions/logs/)

---

**修復優先級**: 🔴 高（影響核心功能）  
**預計修復時間**: 5 分鐘  
**需要重啟**: ❌ 不需要  
**需要重新部署**: ❌ 不需要

---

**Created**: 2026-02-01  
**Status**: ✅ 修復方案已準備  
**Next Step**: 執行 SQL 修復腳本

**Made with ❤️ by Sticker Tycoon Team**

