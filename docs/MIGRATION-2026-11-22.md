# 搬遷報告：貼圖大亨 → 你的帳號

**日期**：2026-11-22
**來源**：`~/Downloads/sticker-tycoonV.801`（唯讀保留，未修改）
**新位置**：`~/workspace/sticker-tycoon`

---

## 1. 做了什麼

| 項目 | 狀態 | 證據 |
|---|---|---|
| 原始碼搬到新資料夾 | ✅ | `~/workspace/sticker-tycoon` |
| 完整 git 歷史保留 | ✅ | 455 個 commit（2025-11-27 → 2026-03-09） |
| 補上遠端缺少的 commit | ✅ | `09bc89a`（含 `line-webhook.js` 的 5 行修改） |
| git remote 改指你的 GitHub | ✅ | `github.com/andy0958338099/sticker-tycoon` |
| 推上你的 GitHub | ✅ | `e89d435` |
| 修掉會讓部署失敗的 netlify.toml | ✅ | 移除 20 處非法 `timeout` |
| 依賴乾淨重裝 | ✅ | `npm ci` → 1687 packages，sharp 可用（libvips 8.17.3） |
| 巢狀子 repo 分離 | ✅ | `deploy/line-pay-reset/` → `~/workspace/line-pay-reset-service/` |
| `.env` 建檔（gitignored） | ✅ | 已帶入 LINE token |

## 2. 憑證現況

`.env` 已建立，**已在 .gitignore 內**（`git check-ignore` 確認）。

| 變數 | 狀態 | 來源 |
|---|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ 已備妥 | 你提供，實測有效 |
| `LINE_CHANNEL_SECRET` | ❌ 待補 | LINE Developers Console → Basic settings |
| `SUPABASE_URL` | ✅ 已填 | `dpuxmetnpghlfgrmthnv`（實測專案活著，401=正常） |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ 待補 | Supabase 專案設定 → API |
| `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY` | ❌ 待補 | 同上 |
| `AI_IMAGE_API_KEY` | ❌ 待補 | AI 圖片生成服務 |
| `DEEPSEEK_API_KEY` | ❌ 待補 | DeepSeek / 代理 API |
| `ADMIN_API_KEY` / `ADMIN_TOKEN` / `SCHEDULED_API_KEY` | ❌ 待補 | 自訂管理金鑰 |

**沒有 Supabase 的 service role key，`line-webhook.js` 就無法載入**
（第 8 行 `require('./supabase-client')` 會立刻建立 client，缺 key 直接 throw）。
這是繼續開發的第一道門檻。

## 3. 測試現況

| 位置 | 結果 |
|---|---|
| 原始目錄（搬遷前對照組） | 265 個測試，214 通過，51 失敗 |
| 新位置（重裝依賴後） | **289 個測試，236 通過，53 失敗** |

測試數從 265 → 289：原本的 `node_modules` 是從舊環境複製的，
`sharp` 缺 darwin-arm64 二進位，導致部分測試沒被收集到。重裝後多 24 個能跑。

**失敗的 6 個 suite 與搬遷前完全相同**，是既有技術債 —— 程式碼重構過但測試沒同步：

| 測試 | 期望的 API | 程式實際匯出 |
|---|---|---|
| `utils/logger.test.js` | `log` `logError` `logInfo` `logWarn` `logDebug` `logSuccess` | `debug` `info` `warn` `error` `success` `logExecutionTime` `createUserLogger` |
| `utils/cache-manager.test.js` | `createCache` `cacheMiddleware` `clearAllCaches` | `CacheManager` `globalCache` |
| `ai-generator` / `image-processor` / `sticker-styles` / `creation-flow-manager` | — | 需個別確認 |

對應的重構 commit：`72c1f71`（logger）、`7c37f68`（cache-manager）。

## 4. 舊站台狀況

`sticker-tycoon.netlify.app` **仍然活著**，但已有部分 function 故障：

| 端點 | 狀態 |
|---|---|
| `/` 首頁 | 200 |
| `line-webhook` | 200（回 `{"message":"Method Not Allowed but OK"}`） |
| `admin-project-overview` | 200 |
| `web-api-auth-login` | 403 |
| `demo-gallery` | 500 |
| `sticker-styles` | 502 |

舊 Netlify site ID `d5c4f277-1164-4af8-ab06-6c7ff9ab1a3c` **不在你目前帳號**
（你只有 `andy0958338099’s team` 一個 team，底下 4 個站台）。

**所以我沒有部署權限，也不會動舊站台。** 這是「搬回來」的真正含義：
程式碼與資料庫搬回來，在你的帳號重建部署。

## 5. 修掉的部署阻斷點

`netlify.toml` 原本有 **20 處** `[functions."xxx"] timeout` 設定（10 / 26 / 30 / 60 / 900）。

Netlify function 設定的**合法欄位只有**：
`deno_import_map` / `external_node_modules` / `ignored_node_modules` /
`included_files` / `memory` / `node_bundler` / `region` / `schedule` / `vcpu`

`timeout` 不在其中 —— **寫了會讓整個部署失敗**（逾時上限本來就由方案決定，
背景 function 固定 15 分鐘）。已全部移除，並保留合法的
`[functions."scheduled-morning-greeting-background"] schedule`。

已用 Netlify 官方 schema 驗證所有 `[functions.*]` 區塊欄位皆合法，
TOML 語法也通過解析器驗證。

## 6. 下一步

### 需要你補的東西

1. **Supabase service role key**（最高優先，缺這個程式跑不起來）
   → Supabase 專案 `dpuxmetnpghlfgrmthnv` → Project Settings → API
2. **LINE Channel secret**
   → LINE Developers Console → 貼圖大亨 channel → Basic settings
3. **AI API key**（圖片生成，沒有就生不了貼圖）

### 我可以接著做的

- 在你的 Netlify 帳號建新站台，綁 GitHub auto-deploy
- 把憑證同步到站台環境變數
- 修那 6 個 suite 的技術債（讓測試對齊重構後的 API）
- 接各專案指令（部落格 / 台灣電視）到共用骨架

### 正式站切換的風險

切換時機要考慮：舊站 `sticker-tycoon.netlify.app` 的 webhook 還指向它。
改成指向新站台後，舊站的貼圖生成服務就停止。
**建議先在新站台完整測試通過，再切 webhook** —— 切換只需改 Console 一個欄位，
可逆。

## 7. 相關檔案

- `.env` — 憑證（gitignored）
- `.env.example` — 憑證範本（原始的，未改）
- `netlify.toml` — 已修正
- 原始碼仍在 `~/Downloads/sticker-tycoonV.801`（未修改，可對照）
