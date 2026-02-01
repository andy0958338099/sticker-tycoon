# 🎨 貼圖大亨 (Sticker Tycoon)

[![Netlify Status](https://api.netlify.com/api/v1/badges/YOUR_BADGE_ID/deploy-status)](https://app.netlify.com/sites/YOUR_SITE_NAME/deploys)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 輕鬆三步驟，創建專屬 LINE 貼圖 - AI 驅動的 LINE Bot 貼圖生成系統

[立即使用](https://line.me/R/ti/p/@sticker-tycoon) | [功能特色](#功能特色) | [技術架構](#技術架構) | [部署指南](#部署指南) | [Logo 設置](#-logo-設置)

---

## 📖 專案介紹

**貼圖大亨**是一個基於 LINE Bot 的 AI 貼圖自動生成系統，讓任何人都能輕鬆創建符合 LINE 官方規格的專屬貼圖組。

### 🎯 核心價值
- 🚀 **零技術門檻** - 無需設計經驗，對話式創建
- 🤖 **AI 自動生成** - 使用 Gemini 2.0 Flash 生成高品質圖片
- 📦 **一鍵打包** - 自動符合 LINE 官方規格
- 🎁 **下載服務**（下載+代上架共60張）- 懶得自己上傳？我們幫你搞定！

---

## ✨ 功能特色

### 🎨 多種風格選擇
- 📸 **美顏真實** (照片轉貼圖)
- 🥰 可愛風
- 😎 酷炫風
- 🤣 搞笑風
- ✨ 簡約風
- 🎌 動漫風
- 👾 像素風
- ✏️ 塗鴉風

### 🛠️ 強大功能
- ✅ **對話式創建流程** - 引導式步驟，輕鬆完成
- ✅ **照片轉貼圖** - 上傳照片，AI 自動轉換成貼圖
- ✅ **自動去背** - 智能去背，符合 LINE 規格
- ✅ **批次生成** - 支援 8/16/24/32/40 張貼圖
- ✅ **張數系統** - 新用戶免費 40 張
- ✅ **推薦獎勵** - 邀請好友，雙方各得 10 張
- ✅ **下載服務**（下載+代上架共60張）- 專業團隊協助上架到 LINE Store

### 📊 管理功能
- 👤 用戶管理
- 🎫 張數交易記錄
- 📦 貼圖組管理
- 🎁 推薦系統
- 📤 上架申請管理

---

## 🏗️ 技術架構

### 技術棧
- **Runtime:** Node.js >= 18.0.0
- **部署平台:** Netlify (Serverless Functions)
- **資料庫:** Supabase (PostgreSQL)
- **LINE SDK:** @line/bot-sdk ^9.3.0
- **AI API:** Gemini 2.0/2.5 Flash
- **圖片處理:** Sharp, Canvas
- **測試框架:** Jest

### 系統架構
```
┌─────────────┐
│  LINE User  │
└──────┬──────┘
       │ Message
       ▼
┌─────────────────────┐
│  LINE Bot Webhook   │  (line-webhook.js)
└──────┬──────────────┘
       │
       ├─────► Conversation State (Supabase)
       │
       ├─────► AI Generator (Gemini API)
       │
       ├─────► Image Processor (Sharp)
       │
       ├─────► Background Worker
       │       (sticker-generator-worker-background.js)
       │
       └─────► Token System (Supabase - 張數系統)
```

---

## 🚀 快速開始

### 環境需求
- Node.js >= 18.0.0
- npm 或 yarn
- Netlify 帳號
- Supabase 帳號
- LINE Developers 帳號
- Gemini API Key

### 安裝步驟

1. **Clone 專案**
```bash
git clone https://github.com/YOUR_USERNAME/sticker-tycoon.git
cd sticker-tycoon
```

2. **安裝依賴**
```bash
npm install
```

3. **環境變數設定**

複製 `.env.example` 並重命名為 `.env`，填入以下資訊：

```bash
# LINE Bot 設定
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret

# Supabase 設定
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI 圖片生成設定
AI_IMAGE_API_URL=https://tbnx.plus7.plus
AI_IMAGE_API_KEY=your_gemini_api_key
AI_MODEL=gemini-2.0-flash-exp-image-generation

# 可選：DeepSeek 表情增強
DEEPSEEK_API_KEY=your_deepseek_api_key
```

4. **設定 Supabase 資料庫**

在 Supabase Dashboard 執行 `supabase-schema.sql`：
```bash
# 登入 Supabase Dashboard → SQL Editor → 新增查詢
# 複製貼上 supabase-schema.sql 的內容並執行
```

建立 Storage Buckets：
- `sticker-images` (公開)
- `user-photos` (公開)

5. **本地開發**
```bash
npm run dev
```
本地伺服器會在 `http://localhost:8888` 啟動

6. **執行測試**
```bash
npm test              # 執行所有測試
npm run test:watch    # 監視模式
npm run test:coverage # 測試覆蓋率
```

---

## 📦 部署指南

### Netlify 部署

1. **連接 GitHub**
   - 登入 [Netlify](https://app.netlify.com/)
   - New site from Git → 選擇此 repository

2. **環境變數設定**
   - Site settings → Environment variables
   - 添加所有 `.env` 中的變數

3. **部署設定**
   ```
   Build command: npm run build
   Publish directory: public
   Functions directory: functions
   ```

4. **部署**
   - 推送到 main 分支會自動觸發部署
   - 或手動點擊 "Deploy site"

### LINE Bot Webhook 設定

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)
2. 選擇你的 Messaging API Channel
3. 設定 Webhook URL:
   ```
   https://YOUR_NETLIFY_DOMAIN.netlify.app/.netlify/functions/line-webhook
   ```
4. 啟用 "Use webhook"
5. 驗證 Webhook

---

## 🎮 使用方式

### 基本指令

| 指令 | 功能 |
|------|------|
| `創建貼圖` | 開始創建新貼圖組 |
| `我的貼圖` | 查看貼圖列表 |
| `張數` | 查詢張數餘額 |
| `推薦好友` | 取得推薦碼 |
| `查詢進度` | 查看生成進度 |
| `取消` | 取消當前創建流程 |

### 創建流程

1. **輸入「創建貼圖」**
2. **選擇創建方式**
   - 📸 照片轉貼圖（上傳照片）
   - ✍️ 描述角色（文字描述）
3. **選擇風格** - 可愛、酷炫、搞笑等
4. **選擇取景** - 全身、半身、大頭照等
5. **選擇場景** - 純色背景、辦公室、咖啡廳等
6. **選擇表情模板** - 基本日常、可愛表情、辦公室等
7. **選擇數量** - 8/16/24/32/40 張
8. **確認生成** - 開始 AI 生成

### 張數機制

- 🎁 新用戶: 免費 **40 張**
- 🎨 生成 1 張貼圖: 消耗 **1 張**
- 📦 下載貼圖包: 消耗 **60 張**
- 🚀 下載 + 代上架: 消耗 **60 張**（下載需60張，可透過「分享給好友」獲得免費張數，或「購買張數」快速取得）
- 👥 推薦好友: 雙方各得 **10 張** (限時推廣，上限增至30位)

### 儲值方案

| 金額 | 張數 | 單價 |
|------|------|------|
| NT$ 300 | 140 張 | 2.14/張 |
| NT$ 500 | 260 張 | 1.92/張 |

---

## 📁 專案結構

```
sticker-tycoon/
├── functions/                    # Netlify Functions
│   ├── __tests__/               # 測試檔案
│   │   ├── conversation-state.test.js
│   │   ├── deepseek-enhancer.test.js
│   │   ├── errors.test.js
│   │   ├── sticker-styles.test.js
│   │   └── supabase-client.test.js
│   ├── handlers/                # 處理器
│   │   └── create-handler.js   # 創建流程處理
│   ├── services/                # 服務層（待建立）
│   ├── admin-cleanup.js         # 管理員清理功能
│   ├── admin-listing.js         # 上架申請管理
│   ├── admin-rich-menu.js       # Rich Menu 管理
│   ├── admin-token.js           # 張數管理
│   ├── ai-generator.js          # AI 圖片生成核心
│   ├── conversation-state.js    # 對話狀態管理
│   ├── deepseek-enhancer.js     # 表情增強
│   ├── download-pack.js         # 下載打包
│   ├── error-handler.js         # 錯誤處理
│   ├── errors.js                # 自定義錯誤
│   ├── image-processor.js       # 圖片處理
│   ├── line-webhook.js          # LINE Webhook 主要處理
│   ├── pack-for-line.js         # LINE 貼圖打包
│   ├── photo-handler.js         # 照片處理
│   ├── sticker-flex-message.js  # Flex Message 模板
│   ├── sticker-styles.js        # 風格、表情模板
│   ├── supabase-client.js       # Supabase 操作
│   └── sticker-generator-worker-background.js  # 背景生成任務
├── public/                      # 靜態檔案
│   ├── admin/                   # 管理後台
│   ├── index.html              # 官網首頁
│   ├── queue.html              # 佇列管理
│   └── *.png                   # 圖片資源
├── scripts/                     # 工具腳本
│   ├── setup-rich-menu.js      # Rich Menu 設定
│   └── generate-rich-menu-image.js
├── .env.example                 # 環境變數範例
├── jest.config.js              # Jest 測試配置
├── netlify.toml                # Netlify 配置
├── package.json                # 專案配置
├── supabase-schema.sql         # 資料庫 Schema
└── README.md                   # 本文件
```

---

## 🧪 測試

### 執行測試
```bash
npm test                 # 執行所有測試
npm run test:watch       # 監視模式
npm run test:coverage    # 測試覆蓋率報告
```

### 測試覆蓋率
當前覆蓋率：
- Statements: 5.38% (目標 50%+)
- Branches: 4.57% (目標 50%+)
- Functions: 11.87% (目標 50%+)
- Lines: 5.43% (目標 50%+)

> ⚠️ 測試覆蓋率需要改進，詳見 [IMPROVEMENT_CHECKLIST.md](./IMPROVEMENT_CHECKLIST.md)

---

## 📚 API 文檔

### Netlify Functions

| 端點 | 方法 | 功能 | Timeout |
|------|------|------|---------|
| `/line-webhook` | POST | LINE Webhook 處理 | 10s |
| `/sticker-generator-worker-background` | POST | 背景貼圖生成 | 15min |
| `/image-processor` | POST | 圖片處理 | 30s |
| `/download-pack` | GET | 下載貼圖包 | 30s |
| `/pack-for-line` | POST | LINE 貼圖打包 | 26s |
| `/admin-rich-menu` | GET/POST | Rich Menu 管理 | 30s |
| `/admin-cleanup` | POST | 清理舊資料 | 60s |
| `/admin-token` | POST | 張數管理 | 10s |
| `/admin-listing` | GET/POST | 上架申請管理 | 10s |

詳細 API 規格請參考各函數的 JSDoc 註解。

---

## 🤝 貢獻指南

歡迎貢獻！請遵循以下步驟：

1. Fork 此專案
2. 創建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

### 開發規範
- 遵循 ESLint 規則（待設定）
- 添加測試覆蓋新功能
- 更新相關文檔
- 提交訊息使用語義化格式

---

## 📄 授權

本專案採用 MIT 授權 - 詳見 [LICENSE](LICENSE) 文件

---

## 🙏 致謝

- [LINE Messaging API](https://developers.line.biz/en/services/messaging-api/)
- [Supabase](https://supabase.com/)
- [Netlify](https://www.netlify.com/)
- [Google Gemini](https://ai.google.dev/)
- [Sharp](https://sharp.pixelplumbing.com/)

---

## 🎨 Logo 設置

### 快速開始

網站已經配置好所有圖標引用，只需要準備以下圖標文件：

```bash
public/
├── favicon.ico          # 16x16, 32x32, 48x48
├── logo-192.png         # 192x192 像素
├── logo-512.png         # 512x512 像素
├── apple-touch-icon.png # 180x180 像素
└── manifest.json        # ✅ 已創建
```

### 檢查設置狀態

```bash
# 運行自動檢查腳本
./scripts/check-logo-setup.sh
```

### 創建圖標文件

**方法 1: 使用線上工具 (推薦)**
1. 訪問 [Favicon Generator](https://realfavicongenerator.net/)
2. 上傳 STICKER TYCOON 原始圖片
3. 下載生成的文件並放置到 `public/` 目錄

**方法 2: 使用 ImageMagick**
```bash
cd public
convert original.png -resize 192x192 logo-192.png
convert original.png -resize 512x512 logo-512.png
convert original.png -resize 180x180 apple-touch-icon.png
# 創建 favicon.ico...
```

### 詳細文檔

- 📖 [完整設置指南](public/LOGO_SETUP_GUIDE.md)
- 📋 [更新總結](LOGO_UPDATE_SUMMARY.md)

### 已更新的頁面

所有主要頁面已配置圖標引用：
- ✅ 首頁 (index.html) - 包含 header/footer logo 顯示
- ✅ 示範圖集 (demo-gallery.html)
- ✅ 張數購買說明 (token-guide.html)
- ✅ YouTuber 推廣計畫 (youtuber-promotion.html)
- ✅ 管理後台 (admin/index.html)
- ✅ 其他功能頁面

---

## 📞 聯絡方式

- LINE 官方帳號: [@sticker-tycoon](https://line.me/R/ti/p/@sticker-tycoon)
- 問題回報: [GitHub Issues](https://github.com/YOUR_USERNAME/sticker-tycoon/issues)
- Email: johnyarcher2100@yahoo.com.tw

---

**Made with ❤️ by Sticker Tycoon Team | 恩瑋數位科技**

