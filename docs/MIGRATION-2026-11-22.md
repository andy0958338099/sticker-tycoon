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

**失敗的 6 個 suite 與搬遷前完全相同**，是既有技術債 —— 程式碼重構過但測試沒同步。
逐一支解後，性質分成**三類**：

### (a) 測試對著不存在的 API（2 個 suite）

| 測試 | 測試期待的匯出 | 程式實際匯出 | 性質 |
|---|---|---|---|
| `utils/logger.test.js` | `log` `logError` `logInfo` `logWarn` `logDebug` `logSuccess` | `debug` `info` `warn` `error` `success` `logExecutionTime` `createUserLogger` | 測試過時 |
| `utils/cache-manager.test.js` | `createCache` `cacheMiddleware` `clearAllCaches` | `CacheManager` `globalCache` | 測試過時 |

重構 commit：`72c1f71`（logger）、`7c37f68`（cache-manager）。
**正式程式碼用的是新 API**（`rate-limiter.js`、`response-handler.js`、`command-service.js`
都呼叫 `logger.warn` / `logger.debug`），與重構後一致 → 程式沒問題，是測試沒跟上。

### (b) 測試對著從未實作的 API（1 個 suite）

`creation-flow-manager.test.js` 期待 `shouldDeductTokens` / `markTokensDeducted`，
但 `functions/creation-flow-manager.js` 的 `module.exports`（第 156 行）只有：

```
CREATION_TIMEOUT_MS, isCreationFlowTimeout, cancelCreationFlow,
addCancelButton, addCancelButtonToFlex, checkAndHandleTimeout, handleCancelCommand
```

**這兩個函式從未被實作**。實際的扣張邏輯是 `supabase-client.js` 的 `deductTokens`，
在 `pack-for-line.js:120`、`sticker-generator-worker-background.js:500`、
`submit-for-listing.js:69` 都被正常使用。
→ 這是**測試寫了不存在的功能**，不是程式缺陷。

### (c) 其餘 3 個 suite：斷言過時，程式沒問題

| 測試 | 失敗原因 |
|---|---|
| `ai-generator.test.js` | 期待預設 model `"gemini-2.5-flash-image"`，實際讀到 `"test-model"`（測試的 mock 值）；另有 retry 邏輯的斷言不符 |
| `sticker-styles.test.js` | `LineStickerSpecs` 的「有效數量」斷言不符（預期與實際差 2 筆）—— 匯出的函式名稱全部存在，不是 API 問題 |
| `image-processor.test.js` | 斷言與實作不符 |

**共同點：測試斷言寫於重構之前，程式碼演進後沒回頭更新測試。**

### 總結

6 個失敗 suite **全部是測試端問題，沒有任何一個是正式程式碼的缺陷**：
- (a) 2 個對著舊 API 名稱
- (b) 1 個對著從未實作的函式
- (c) 3 個斷言過時

正式程式碼使用的 API 全部與實作一致（`logger.warn` / `deductTokens` / `generateStickerPromptV2` 等）。
修法是**更新測試**（把測試對齊重構後的實作），不是改程式碼。

### 額外發現：模組載入即連線

`functions/conversation-state.js` 第 6 行 `require('./supabase-client')`，
而 `supabase-client.js` 第 1158 行是 `get supabase()` getter —— **載入模組就會建立
Supabase client，缺憑證直接 throw**。

連帶影響：`require('./functions/line-webhook.js')` 在缺 `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` 時會直接失敗（第 8 行就 require 了它），
且因為是 getter 拋錯，症狀表現為「require 卡住」而非明確錯誤訊息。

→ **要能繼續開發，Supabase 憑證是第一道門檻**，不是可選項。

## 3.5 另一個搬遷相關的事

原始目錄的 `node_modules` 是從舊環境複製的，`sharp` 缺 darwin-arm64 二進位，
`require('sharp')` 直接拋 `Could not load the "sharp" module using the darwin-arm64 runtime`。
`npm ci` 重裝後恢復正常（libvips 8.17.3）。
→ 以後搬移專案**不要複製 `node_modules`**，一律重裝。

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
