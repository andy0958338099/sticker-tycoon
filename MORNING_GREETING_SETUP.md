# 🌅 早安圖自動生成設定指南

## 問題說明

目前早安圖無法自動生成的原因：
- ❌ Netlify Scheduled Functions 需要付費方案
- ❌ 目前設定的排程 `schedule = "0 21 * * *"` 無法在免費方案執行

## 解決方案

### 方案 1：使用 Cron-Job.org（免費，推薦）

**步驟：**

1. **註冊 Cron-Job.org**
   - 前往：https://cron-job.org/
   - 免費註冊帳號

2. **創建 Cron Job**
   - 點擊「Create cronjob」
   - 設定如下：

   ```
   Title: 貼圖大亨 - 每日早安圖生成
   URL: https://sticker-tycoon.netlify.app/.netlify/functions/scheduled-morning-greeting-background
   Schedule: 
     - 每天 (Every day)
     - 時間：05:00 (台灣時間)
   Request method: GET
   Headers:
     - x-api-key: [你的 API Key]
   ```

3. **設定 API Key（安全性）**
   - 在 Netlify 環境變數中添加：
     ```
     SCHEDULED_API_KEY=your-secret-key-here
     ```
   - 在 Cron-Job.org 的 Headers 中添加相同的 key

4. **測試**
   - 點擊「Run now」測試是否正常執行
   - 檢查 Netlify Functions 日誌

---

### 方案 2：使用 EasyCron（免費）

**步驟：**

1. **註冊 EasyCron**
   - 前往：https://www.easycron.com/
   - 免費方案：每天最多 1 個任務

2. **創建 Cron Job**
   ```
   URL: https://sticker-tycoon.netlify.app/.netlify/functions/scheduled-morning-greeting-background?apiKey=YOUR_API_KEY
   Cron Expression: 0 5 * * *
   Timezone: Asia/Taipei
   ```

---

### 方案 3：使用 GitHub Actions（免費）

**步驟：**

1. **在專案根目錄創建 `.github/workflows/morning-greeting.yml`**

```yaml
name: Generate Morning Greeting

on:
  schedule:
    # 每天 UTC 21:00 (台灣時間 05:00)
    - cron: '0 21 * * *'
  workflow_dispatch: # 允許手動觸發

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Morning Greeting Generation
        run: |
          curl -X POST \
            -H "x-api-key: ${{ secrets.SCHEDULED_API_KEY }}" \
            https://sticker-tycoon.netlify.app/.netlify/functions/scheduled-morning-greeting-background
```

2. **在 GitHub Repository Settings > Secrets 添加：**
   ```
   SCHEDULED_API_KEY=your-secret-key-here
   ```

---

## 手動生成早安圖（臨時解決方案）

如果還沒設定自動排程，可以手動生成：

### 方法 1：在 LINE Bot 輸入指令

```
重新生成早安圖
```

這會強制重新生成今日的早安圖。

### 方法 2：直接調用 API

```bash
curl -X POST \
  -H "x-api-key: YOUR_API_KEY" \
  https://sticker-tycoon.netlify.app/.netlify/functions/scheduled-morning-greeting-background
```

---

## 驗證設定是否成功

1. **檢查 Netlify Functions 日誌**
   - 前往 Netlify Dashboard
   - Functions > scheduled-morning-greeting-background
   - 查看執行記錄

2. **檢查 Supabase 資料庫**
   - 查詢 `morning_greetings` 表
   - 確認今日日期的記錄是否存在

3. **在 LINE Bot 測試**
   - 輸入「早安圖」
   - 應該會收到今日的早安圖

---

## 推薦設定（最簡單）

**使用 Cron-Job.org + 每天早上 5:00 自動生成**

1. 註冊 Cron-Job.org（1 分鐘）
2. 創建 Cron Job（2 分鐘）
3. 設定 API Key（1 分鐘）
4. 測試執行（1 分鐘）

**總共只需 5 分鐘！**

---

## 常見問題

### Q: 為什麼選擇早上 5:00？
A: 這樣用戶早上 6-7 點起床時，早安圖已經準備好了。

### Q: 如果生成失敗怎麼辦？
A: 
1. 檢查 Netlify Functions 日誌
2. 檢查 AI API 額度是否用完
3. 手動執行「重新生成早安圖」指令

### Q: 可以改成其他時間嗎？
A: 可以！修改 Cron 表達式即可：
- 早上 6:00：`0 6 * * *`
- 早上 7:00：`0 7 * * *`
- 凌晨 2:00：`0 2 * * *`

### Q: 需要付費嗎？
A: 不需要！以上三個方案都是免費的。

---

## 立即行動

**現在就去設定 Cron-Job.org，5 分鐘搞定！**

1. 👉 https://cron-job.org/
2. 註冊 → 創建 Cron Job → 完成！

---

**Made with ❤️ by Sticker Tycoon Team**

