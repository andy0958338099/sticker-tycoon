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

### 最終結果

| 階段 | 測試總數 | 通過 | 失敗 | suite |
|---|---|---|---|---|
| 原始目錄（搬遷前對照組） | 265 | 214 | 51 | 6 失敗 / 8 通過 |
| 搬遷後（重裝依賴） | 289 | 236 | 53 | 6 失敗 / 8 通過 |
| **修完技術債** | **283** | **283** | **0** | **14 全通過** |

測試數 265 → 289：原本的 `node_modules` 是從舊環境複製的，`sharp` 缺 darwin-arm64
二進位，導致部分測試沒被收集到。`npm ci` 重裝後恢復。
→ **搬移專案不要複製 `node_modules`，一律重裝。**

### 修了 51 個失敗測試，同時修出 2 個真實缺陷

#### 真實缺陷 1：`LOG_LEVEL=debug` 永遠開不起來

```js
// functions/utils/logger.js（修前）
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;
```

`LOG_LEVELS.DEBUG = 0`，而 `0` 是 falsy → `||` 判定成「沒設定」而落到 INFO。
**結果：開發時設 `LOG_LEVEL=debug` 完全沒效果，debug log 永遠不輸出。**
改用 `??`。驗證：debug/info/warn/error 四級各輸出 5/4/3/2 則（success 恆輸出），
修前 `debug` 級會錯誤地只輸出 4 則。

#### 真實缺陷 2：`CacheManager` 缺 `has()` 方法

有 `get`/`set`/`delete`/`clear` 但沒有 `has()`。新增，含 TTL 過期處理
（過期視為不存在並順手清掉髒資料）。

#### 相容 API（重構遺留）

| 模組 | 加回的相容 API | 原因 |
|---|---|---|
| `utils/logger.js` | `log` `logError` `logInfo` `logWarn` `logDebug` `logSuccess` | 舊版名稱；重構後改名為 `info`/`error`/`warn`/`debug`/`success`。舊 `log()` 支援多參數與 Error 物件，別名層做轉換 |
| `utils/cache-manager.js` | `createCache` `cacheMiddleware` `clearAllCaches` | 舊版工廠函式介面；重構後改成 `globalCache` 單例 + `CacheManager` 類別 |

#### 測試端的修正（6 個 suite）

| 測試 | 問題 | 修法 |
|---|---|---|
| `creation-flow-manager` | 期待 `shouldDeductTokens` / `markTokensDeducted` —— **這兩個函式從未被實作** | 刪除測試。測試描述的是「先扣張數、失敗再退」的早期設計，後來改成「生成成功後才扣」；且測試用 snake_case `tokens_deducted`，程式碼用 camelCase `tokensDeducted`，從未對接 |
| `utils/cache-manager` | 期待 `get()` 回 `undefined` | 改測試。模組既定契約是回 `null`（`getOrSet` 用 `cached !== null` 判斷），改成 undefined 會讓該判斷失效 |
| `ai-generator`（model 名稱） | 讀 `process.env.AI_MODEL`，但 `setup.js` 全域設了 `'test-model'` | 改驗 fallback 邏輯本身 |
| `ai-generator`（重試） | 只呼叫一次 `axios.post` 卻期待 resolve | 改測真正的重試迴圈 `generateStickerImage(style, characterDescription, expression)` |
| `ai-generator`（mock） | `jest.mock('../sticker-styles')` 自動 mock 讓 `generateStickerPrompt` 回 undefined → 走不到 axios | 改用 `jest.requireActual` 保留該純函式的真實實作 |
| `ai-generator`（mock 時機） | `clearMocks: true` 會清掉 `jest.fn()` 的實作（回 undefined） | mock 必須在 `beforeEach` 設定，不能只放 `it` 內 |
| `sticker-styles` | 期待 `validCounts` 為 `[4,8,12]`，實際 `[6,12,18]` | 改測試。6 宮格批次生成優化是刻意的產品決策（每 6 張 = 1 次 API），不是 LINE 官方規格 |

**結論：6 個失敗 suite 全部是測試端問題，沒有任何一個是正式程式碼的缺陷。**
（但修測試的過程中找出了上面那 2 個真實缺陷。）

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
