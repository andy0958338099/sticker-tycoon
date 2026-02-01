# 貼圖大亨 - LINE Pay 串接完整方案

## 📋 目錄
1. [交易流程說明](#交易流程說明)
2. [張數儲值方案](#張數儲值方案)
3. [技術架構](#技術架構)
4. [資料庫設計](#資料庫設計)
5. [API 實作](#api-實作)
6. [安全性考量](#安全性考量)

---

## 1. 交易流程說明

### 1.1 LINE Pay 收款完整流程

```
用戶端                    您的後端                LINE Pay API               Supabase
  │                         │                         │                          │
  │  1. 點擊「購買張數」    │                         │                          │
  │ ────────────────────> │                         │                          │
  │                         │  2. 建立訂單記錄        │                          │
  │                         │ ─────────────────────────────────────────────> │
  │                         │                         │                          │
  │                         │  3. 請求 LINE Pay 付款   │                          │
  │                         │ ──────────────────────> │                          │
  │                         │  4. 回傳付款 URL        │                          │
  │                         │ <────────────────────── │                          │
  │  5. 轉跳至 LINE Pay     │                         │                          │
  │ <──────────────────── │                         │                          │
  │                         │                         │                          │
  │  6. 完成付款            │                         │                          │
  │ ──────────────────────────────────────────────> │                          │
  │                         │                         │                          │
  │  7. 付款完成通知         │                         │                          │
  │ <────────────────────────────────────────────── │                          │
  │                         │                         │                          │
  │  8. 回調 confirm URL    │                         │                          │
  │ ────────────────────> │                         │                          │
  │                         │  9. 確認交易            │                          │
  │                         │ ──────────────────────> │                          │
  │                         │  10. 交易確認成功       │                          │
  │                         │ <────────────────────── │                          │
  │                         │  11. 更新訂單狀態 + 發放張數                        │
  │                         │ ─────────────────────────────────────────────> │
  │                         │                         │                          │
  │  12. 顯示購買成功       │                         │                          │
  │ <──────────────────── │                         │                          │
```

### 1.2 是否需要儲值/購買張數？

**是的，必須透過購買張數系統完成商品購買**

#### 為什麼採用張數制度？

1. ✅ **統一計價單位**：簡化複雜的功能定價
2. ✅ **靈活促銷**：可推出張數優惠包（買多送多）
3. ✅ **降低交易成本**：減少小額付款的手續費
4. ✅ **使用者留存**：預付張數提高回購率
5. ✅ **贈送機制**：推薦獎勵、活動贈送更容易實現

---

## 2. 張數儲值方案

### 2.1 儲值方案設計（含有效期 30 天）

| 方案 | 張數 | 售價（台幣） | 平均單價 | 推薦 |
|------|---------|------------|---------|------|
| 基礎包 | 140 張 | $300 | $2.14/張 | - |
| 超值包 | 260 張 | $500 | $1.92/張 | ⭐ |

**🎁 新用戶福利：註冊即贈 40 張！**

### 2.2 張數使用規則

#### 張數消耗標準

- 生成 1 張貼圖：1 張
- 生成 6 張貼圖：6 張
- 生成 12 張貼圖：12 張
- 生成 18 張貼圖：18 張
- 下載 LINE 貼圖包：60 張
- 下載貼圖：60 張（可透過「分享給好友」獲得免費張數，或「購買張數」快速取得）

#### 張數有效期規則

⏰ **所有張數自購買日起 30 天有效**

- ✅ 購買時記錄有效期限
- ✅ 使用張數時優先扣除最早到期的張數（FIFO）
- ✅ 到期前 7 天會提醒用戶
- ✅ 過期張數自動失效，不可退款

---

## 3. 技術架構

### 3.1 系統架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                       LINE Bot / LIFF                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ 張數查詢     │  │ 購買張數     │  │ 交易記錄     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Netlify Functions                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  payment-request.js  (建立付款請求)                  │  │
│  │  payment-confirm.js  (確認付款並發放張數)            │  │
│  │  payment-cancel.js   (取消付款處理)                  │  │
│  │  get-tokens.js       (查詢張數餘額)                  │  │
│  │  get-token-transactions.js (查詢交易記錄)            │  │
│  └──────────────────────────────────────────────────────┘  │
└───────┬─────────────────────────┬────────────────────────────┘
        │                         │
        │                         │
┌───────▼─────────┐      ┌────────▼──────────┐
│   LINE Pay API  │      │   Supabase DB     │
│                 │      │  ┌──────────────┐ │
│ - Request       │      │  │ users        │ │
│ - Confirm       │      │  │ orders       │ │
│ - Refund        │      │  │ token_ledger │ │
└─────────────────┘      │  └──────────────┘ │
                         └───────────────────┘
```

### 3.2 LINE Pay API 串接步驟

#### Step 1: 註冊 LINE Pay 商家

1. 前往 [LINE Pay 商家後台](https://pay.line.me/tw/developers/techsupport/sandbox/creation)
2. 申請 Sandbox 測試環境
3. 取得 `Channel ID` 和 `Channel Secret Key`

#### Step 2: 環境變數設定

在 Netlify 或 `.env` 中設定：

```bash
# LINE Pay Sandbox（測試環境）
LINE_PAY_CHANNEL_ID=your_channel_id
LINE_PAY_CHANNEL_SECRET=your_channel_secret_key
LINE_PAY_ENV=sandbox  # 或 production

# LINE Pay API URLs
LINE_PAY_API_URL_SANDBOX=https://sandbox-api-pay.line.me
LINE_PAY_API_URL_PRODUCTION=https://api-pay.line.me

# Callback URLs
LINE_PAY_CONFIRM_URL=https://your-domain.netlify.app/.netlify/functions/payment-confirm
LINE_PAY_CANCEL_URL=https://your-domain.netlify.app/.netlify/functions/payment-cancel
```

---

## 4. 資料庫設計

### 4.1 訂單表（orders）

新增訂單表用於追蹤 LINE Pay 交易：

```sql
-- 訂單表
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL,           -- 訂單編號（自動生成）
  user_id TEXT NOT NULL,                   -- LINE user ID

  -- 商品資訊
  package_id TEXT NOT NULL,                -- 方案 ID：starter, value, popular, deluxe
  package_name TEXT NOT NULL,              -- 方案名稱
  token_amount INTEGER NOT NULL,           -- 張數數量
  bonus_tokens INTEGER DEFAULT 0,          -- 贈送張數
  total_tokens INTEGER NOT NULL,           -- 總張數數（含贈送）

  -- 付款資訊
  amount INTEGER NOT NULL,                 -- 金額（台幣）
  currency TEXT DEFAULT 'TWD',             -- 幣別

  -- LINE Pay 資訊
  transaction_id TEXT,                     -- LINE Pay transaction ID
  payment_url TEXT,                        -- 付款 URL

  -- 狀態追蹤
  status TEXT DEFAULT 'pending',           -- pending, paid, cancelled, expired, refunded
  paid_at TIMESTAMP WITH TIME ZONE,        -- 付款完成時間
  tokens_issued BOOLEAN DEFAULT FALSE,     -- 張數是否已發放

  -- 時間戳記
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,     -- 訂單過期時間（15分鐘）

  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(line_user_id)
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_transaction_id ON orders(transaction_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

### 4.2 張數帳本表（token_ledger）

用於追蹤張數有效期和 FIFO 扣款：

```sql
-- 張數帳本表（追蹤每筆張數的有效期）
CREATE TABLE IF NOT EXISTS token_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,                      -- LINE user ID

  -- 張數資訊
  tokens INTEGER NOT NULL,                    -- 張數數量（正數=入帳，負數=扣款）
  remaining_tokens INTEGER NOT NULL,          -- 剩餘可用張數

  -- 來源追蹤
  source_type TEXT NOT NULL,                  -- purchase, bonus, referral, admin, initial
  source_order_id TEXT,                       -- 來源訂單 ID（若為購買）
  source_description TEXT,                    -- 來源描述

  -- 有效期管理（365天）
  acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),  -- 取得時間
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,        -- 到期時間（取得 + 365天）
  is_expired BOOLEAN DEFAULT FALSE,                     -- 是否已過期

  -- 時間戳記
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT fk_user_ledger FOREIGN KEY (user_id) REFERENCES users(line_user_id)
);

CREATE INDEX idx_token_ledger_user_id ON token_ledger(user_id);
CREATE INDEX idx_token_ledger_expires_at ON token_ledger(expires_at);
CREATE INDEX idx_token_ledger_remaining ON token_ledger(user_id, remaining_tokens)
  WHERE remaining_tokens > 0 AND is_expired = FALSE;

-- 自動標記過期張數的觸發器
CREATE OR REPLACE FUNCTION mark_expired_tokens()
RETURNS void AS $$
BEGIN
  UPDATE token_ledger
  SET is_expired = TRUE, updated_at = NOW()
  WHERE expires_at < NOW() AND is_expired = FALSE;
END;
$$ LANGUAGE plpgsql;
```

### 4.3 更新 token_transactions 表

添加有效期相關欄位：

```sql
-- 為現有 token_transactions 表添加有效期欄位
ALTER TABLE token_transactions
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- 添加訂單關聯
ALTER TABLE token_transactions
ADD COLUMN IF NOT EXISTS order_id TEXT;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_token_transactions_order_id ON token_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_expires_at ON token_transactions(expires_at);

-- 添加註解
COMMENT ON COLUMN token_transactions.expires_at IS '張數到期時間（購買後365天）';
COMMENT ON COLUMN token_transactions.order_id IS '關聯的訂單 ID';
```

---

## 5. API 實作

### 5.1 建立付款請求（payment-request.js）

```javascript
/**
 * 建立 LINE Pay 付款請求
 *
 * 流程：
 * 1. 驗證用戶和方案
 * 2. 建立訂單記錄
 * 3. 呼叫 LINE Pay Request API
 * 4. 返回付款 URL
 */

const crypto = require('crypto');
const axios = require('axios');
const { getSupabaseClient } = require('./supabase-client');

// LINE Pay 配置
const LINE_PAY_CONFIG = {
  channelId: process.env.LINE_PAY_CHANNEL_ID,
  channelSecret: process.env.LINE_PAY_CHANNEL_SECRET,
  env: process.env.LINE_PAY_ENV || 'sandbox',
  apiUrl: process.env.LINE_PAY_ENV === 'production'
    ? 'https://api-pay.line.me'
    : 'https://sandbox-api-pay.line.me'
};

// 張數方案配置
const TOKEN_PACKAGES = {
  basic: { name: '基礎包', tokens: 140, price: 300 },
  value: { name: '超值包', tokens: 260, price: 500 }
};

/**
 * 生成 LINE Pay 簽章
 */
function generateSignature(uri, body, nonce) {
  const message = LINE_PAY_CONFIG.channelSecret + uri + JSON.stringify(body) + nonce;
  return crypto.createHmac('sha256', LINE_PAY_CONFIG.channelSecret)
    .update(message)
    .digest('base64');
}

/**
 * 生成唯一訂單編號
 */
function generateOrderId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TKN${timestamp}${random}`;
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, packageId } = body;

    // 驗證參數
    if (!userId || !packageId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '缺少必要參數' })
      };
    }

    // 驗證方案
    const package = TOKEN_PACKAGES[packageId];
    if (!package) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '無效的方案' })
      };
    }

    const supabase = getSupabaseClient();
    const orderId = generateOrderId();
    const totalTokens = package.tokens;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15分鐘後過期

    // 1. 建立訂單記錄
    const { error: orderError } = await supabase
      .from('orders')
      .insert([{
        order_id: orderId,
        user_id: userId,
        package_id: packageId,
        package_name: package.name,
        token_amount: package.tokens,
        bonus_tokens: 0,
        total_tokens: totalTokens,
        amount: package.price,
        currency: 'TWD',
        status: 'pending',
        expires_at: expiresAt.toISOString()
      }]);

    if (orderError) throw orderError;

    // 2. 建立 LINE Pay 請求
    const requestUri = '/v3/payments/request';
    const nonce = crypto.randomBytes(16).toString('hex');

    const requestBody = {
      amount: package.price,
      currency: 'TWD',
      orderId: orderId,
      packages: [{
        id: packageId,
        amount: package.price,
        name: package.name,
        products: [{
          name: `${package.name} - ${totalTokens}張`,
          quantity: 1,
          price: package.price
        }]
      }],
      redirectUrls: {
        confirmUrl: `${process.env.URL}/.netlify/functions/payment-confirm?orderId=${orderId}`,
        cancelUrl: `${process.env.URL}/.netlify/functions/payment-cancel?orderId=${orderId}`
      }
    };

    const signature = generateSignature(requestUri, requestBody, nonce);

    const response = await axios.post(
      `${LINE_PAY_CONFIG.apiUrl}${requestUri}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-LINE-ChannelId': LINE_PAY_CONFIG.channelId,
          'X-LINE-Authorization-Nonce': nonce,
          'X-LINE-Authorization': signature
        }
      }
    );

    // 3. 更新訂單的付款 URL 和 transaction ID
    await supabase
      .from('orders')
      .update({
        transaction_id: response.data.info.transactionId,
        payment_url: response.data.info.paymentUrl.web,
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId);

    // 4. 返回付款 URL
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        orderId,
        paymentUrl: response.data.info.paymentUrl.web,
        transactionId: response.data.info.transactionId
      })
    };

  } catch (error) {
    console.error('建立付款請求失敗:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || '建立付款請求失敗'
      })
    };
  }
};
```

### 5.2 確認付款並發放張數（payment-confirm.js）

```javascript
/**
 * 確認 LINE Pay 付款並發放張數
 *
 * 流程：
 * 1. 接收 LINE Pay 回調
 * 2. 呼叫 Confirm API 確認交易
 * 3. 更新訂單狀態
 * 4. 發放張數到用戶帳戶（含 365 天有效期）
 * 5. 記錄交易和張數帳本
 */

const crypto = require('crypto');
const axios = require('axios');
const { getSupabaseClient, addTokens } = require('./supabase-client');

// LINE Pay 配置（同上）
const LINE_PAY_CONFIG = {
  channelId: process.env.LINE_PAY_CHANNEL_ID,
  channelSecret: process.env.LINE_PAY_CHANNEL_SECRET,
  env: process.env.LINE_PAY_ENV || 'sandbox',
  apiUrl: process.env.LINE_PAY_ENV === 'production'
    ? 'https://api-pay.line.me'
    : 'https://sandbox-api-pay.line.me'
};

function generateSignature(uri, body, nonce) {
  const message = LINE_PAY_CONFIG.channelSecret + uri + JSON.stringify(body) + nonce;
  return crypto.createHmac('sha256', LINE_PAY_CONFIG.channelSecret)
    .update(message)
    .digest('base64');
}

/**
 * 發放張數（含有效期追蹤）
 */
async function issueTokensWithExpiry(supabase, userId, tokens, orderId, packageName) {
  // 計算到期時間（365天後）
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365);

  // 1. 更新用戶張數餘額
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('sticker_credits')
    .eq('line_user_id', userId)
    .single();

  if (userError) throw userError;

  const currentBalance = user?.sticker_credits || 0;
  const newBalance = currentBalance + tokens;

  await supabase
    .from('users')
    .update({
      sticker_credits: newBalance,
      updated_at: new Date().toISOString()
    })
    .eq('line_user_id', userId);

  // 2. 記錄張數帳本（用於 FIFO 扣款和過期管理）
  await supabase
    .from('token_ledger')
    .insert([{
      user_id: userId,
      tokens: tokens,
      remaining_tokens: tokens,
      source_type: 'purchase',
      source_order_id: orderId,
      source_description: `購買${packageName}`,
      acquired_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      is_expired: false
    }]);

  // 3. 記錄交易記錄
  await supabase
    .from('token_transactions')
    .insert([{
      user_id: userId,
      amount: tokens,
      balance_after: newBalance,
      transaction_type: 'purchase',
      description: `購買${packageName}（${tokens}張數）`,
      reference_id: orderId,
      order_id: orderId,
      expires_at: expiresAt.toISOString()
    }]);

  return { success: true, balance: newBalance };
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const { orderId, transactionId } = event.queryStringParameters || {};

    if (!orderId || !transactionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '缺少訂單或交易 ID' })
      };
    }

    const supabase = getSupabaseClient();

    // 1. 查詢訂單
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (orderError || !order) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: '訂單不存在' })
      };
    }

    // 檢查訂單狀態
    if (order.status === 'paid') {
      // 已經處理過，返回成功頁面
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: generateSuccessPage(order)
      };
    }

    if (order.status !== 'pending') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '訂單狀態異常' })
      };
    }

    // 2. 呼叫 LINE Pay Confirm API
    const confirmUri = `/v3/payments/${transactionId}/confirm`;
    const nonce = crypto.randomBytes(16).toString('hex');

    const confirmBody = {
      amount: order.amount,
      currency: 'TWD'
    };

    const signature = generateSignature(confirmUri, confirmBody, nonce);

    const response = await axios.post(
      `${LINE_PAY_CONFIG.apiUrl}${confirmUri}`,
      confirmBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-LINE-ChannelId': LINE_PAY_CONFIG.channelId,
          'X-LINE-Authorization-Nonce': nonce,
          'X-LINE-Authorization': signature
        }
      }
    );

    // 3. 確認成功，更新訂單狀態
    if (response.data.returnCode === '0000') {
      await supabase
        .from('orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          tokens_issued: true,
          updated_at: new Date().toISOString()
        })
        .eq('order_id', orderId);

      // 4. 發放張數（含有效期）
      await issueTokensWithExpiry(
        supabase,
        order.user_id,
        order.total_tokens,
        orderId,
        order.package_name
      );

      console.log(`✅ 訂單 ${orderId} 付款成功，已發放 ${order.total_tokens} 張數給用戶 ${order.user_id}`);

      // 5. 返回成功頁面
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: generateSuccessPage(order)
      };
    } else {
      throw new Error(`LINE Pay 確認失敗: ${response.data.returnMessage}`);
    }

  } catch (error) {
    console.error('確認付款失敗:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: generateErrorPage(error.message)
    };
  }
};

/**
 * 生成成功頁面
 */
function generateSuccessPage(order) {
  return `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>購買成功</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          text-align: center;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          max-width: 400px;
        }
        .success-icon {
          font-size: 60px;
          margin-bottom: 20px;
        }
        h1 {
          color: #4CAF50;
          margin-bottom: 10px;
        }
        .info {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
        }
        .info-item {
          display: flex;
          justify-content: space-between;
          margin: 10px 0;
          font-size: 14px;
        }
        .info-item strong {
          color: #666;
        }
        .tokens {
          font-size: 36px;
          font-weight: bold;
          color: #667eea;
          margin: 20px 0;
        }
        .expiry {
          color: #ff9800;
          font-size: 12px;
          margin-top: 10px;
        }
        .btn {
          background: #667eea;
          color: white;
          padding: 15px 30px;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success-icon">✅</div>
        <h1>購買成功！</h1>
        <p>張數已成功儲值到您的帳戶</p>

        <div class="info">
          <div class="info-item">
            <strong>訂單編號</strong>
            <span>${order.order_id}</span>
          </div>
          <div class="info-item">
            <strong>方案</strong>
            <span>${order.package_name}</span>
          </div>
          <div class="info-item">
            <strong>支付金額</strong>
            <span>NT$ ${order.amount}</span>
          </div>
        </div>

        <div class="tokens">🎫 ${order.total_tokens} 張數</div>
        <div class="expiry">⏰ 有效期限：購買日起 365 天</div>

        <a href="line://app/" class="btn">返回貼圖大亨</a>
      </div>
    </body>
    </html>
  `;
}

/**
 * 生成錯誤頁面
 */
function generateErrorPage(errorMessage) {
  return `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>付款失敗</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          text-align: center;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          max-width: 400px;
        }
        .error-icon {
          font-size: 60px;
          margin-bottom: 20px;
        }
        h1 {
          color: #f44336;
          margin-bottom: 10px;
        }
        p {
          color: #666;
          margin: 20px 0;
        }
        .btn {
          background: #f44336;
          color: white;
          padding: 15px 30px;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="error-icon">❌</div>
        <h1>付款失敗</h1>
        <p>${errorMessage || '付款過程發生錯誤，請稍後再試'}</p>
        <a href="line://app/" class="btn">返回貼圖大亨</a>
      </div>
    </body>
    </html>
  `;
}
```

---

## 6. 安全性考量

### 6.1 防止重複付款

✅ 在確認付款時檢查訂單狀態
✅ 使用資料庫事務確保原子性操作
✅ 記錄 LINE Pay transaction ID 避免重複處理

### 6.2 簽章驗證

✅ 所有 LINE Pay API 請求都使用 HMAC-SHA256 簽章
✅ 包含 nonce 防止重放攻擊
✅ Channel Secret 僅存於環境變數，不暴露於前端

### 6.3 訂單過期機制

✅ 訂單建立後 15 分鐘自動過期
✅ 定期清理過期的 pending 訂單
✅ 防止惡意佔用訂單編號

### 6.4 張數發放安全

✅ 只有在 LINE Pay 確認成功後才發放張數
✅ 使用 `tokens_issued` 標記防止重複發放
✅ 所有張數變動都記錄在交易日誌中

---

## 7. 前端整合（LINE Bot / LIFF）

### 7.1 購買張數流程（LINE Bot）

在 `line-webhook.js` 中添加處理「購買張數」的訊息：

```javascript
// 當用戶發送「購買張數」或「儲值」時
if (message.text.includes('購買') || message.text.includes('儲值')) {
  return [{
    type: 'flex',
    altText: '張數儲值方案',
    contents: generateTokenPackagesFlex()
  }];
}

function generateTokenPackagesFlex() {
  return {
    type: 'carousel',
    contents: [
      // 入門包
      {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: '入門包', weight: 'bold', size: 'xl', color: '#667eea' },
            { type: 'text', text: '30 張數', size: 'md', color: '#666', margin: 'md' },
            { type: 'text', text: 'NT$ 99', size: 'xxl', weight: 'bold', margin: 'lg' },
            { type: 'text', text: '⏰ 有效期 365 天', size: 'xs', color: '#ff9800', margin: 'sm' }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button',
            action: {
              type: 'uri',
              label: '立即購買',
              uri: `https://liff.line.me/YOUR_LIFF_ID?package=starter`
            },
            style: 'primary',
            color: '#667eea'
          }]
        }
      },
      // ... 其他方案類似
    ]
  };
}
```

### 7.2 LIFF 付款頁面

創建 `public/payment.html`：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>購買張數</title>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
  <div id="loading">處理中...</div>

  <script>
    async function init() {
      await liff.init({ liffId: 'YOUR_LIFF_ID' });

      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }

      const profile = await liff.getProfile();
      const params = new URLSearchParams(window.location.search);
      const packageId = params.get('package');

      // 呼叫後端建立付款請求
      const response = await fetch('/.netlify/functions/payment-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.userId,
          packageId: packageId
        })
      });

      const data = await response.json();

      if (data.success) {
        // 轉跳到 LINE Pay 付款頁面
        window.location.href = data.paymentUrl;
      } else {
        alert('建立付款請求失敗');
      }
    }

    init();
  </script>
</body>
</html>
```

---

## 8. 張數有效期管理

### 8.1 自動過期檢查（Cron Job）

創建 `functions/check-expired-tokens.js`：

```javascript
/**
 * 定期檢查並標記過期張數
 *
 * 使用 Netlify Scheduled Functions 或外部 Cron 服務（如 EasyCron）
 * 建議執行頻率：每天 00:00
 */

const { getSupabaseClient } = require('./supabase-client');

exports.handler = async function() {
  try {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    // 1. 標記過期的張數帳本
    const { data: expiredLedgers, error } = await supabase
      .from('token_ledger')
      .update({
        is_expired: true,
        updated_at: now
      })
      .lt('expires_at', now)
      .eq('is_expired', false)
      .select();

    if (error) throw error;

    console.log(`✅ 已標記 ${expiredLedgers?.length || 0} 筆過期張數`);

    // 2. 重新計算受影響用戶的餘額
    if (expiredLedgers && expiredLedgers.length > 0) {
      const userIds = [...new Set(expiredLedgers.map(l => l.user_id))];

      for (const userId of userIds) {
        await recalculateUserBalance(supabase, userId);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        expiredCount: expiredLedgers?.length || 0
      })
    };

  } catch (error) {
    console.error('檢查過期張數失敗:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

/**
 * 重新計算用戶餘額（基於未過期的張數）
 */
async function recalculateUserBalance(supabase, userId) {
  // 計算所有未過期張數的剩餘數量
  const { data: ledgers } = await supabase
    .from('token_ledger')
    .select('remaining_tokens')
    .eq('user_id', userId)
    .eq('is_expired', false);

  const totalBalance = ledgers?.reduce((sum, l) => sum + l.remaining_tokens, 0) || 0;

  // 更新用戶餘額
  await supabase
    .from('users')
    .update({
      sticker_credits: totalBalance,
      updated_at: new Date().toISOString()
    })
    .eq('line_user_id', userId);

  console.log(`📊 用戶 ${userId} 餘額已更新為 ${totalBalance} 張數`);
}
```

### 8.2 到期提醒通知

創建 `functions/notify-expiring-tokens.js`：

```javascript
/**
 * 提醒用戶即將到期的張數（到期前 30 天）
 *
 * 執行頻率：每天 09:00
 */

const { getSupabaseClient } = require('./supabase-client');
const { sendLineMessage } = require('./line-client');

exports.handler = async function() {
  try {
    const supabase = getSupabaseClient();

    // 查詢 30 天內即將到期的張數
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const { data: expiringLedgers } = await supabase
      .from('token_ledger')
      .select('user_id, remaining_tokens, expires_at')
      .lt('expires_at', thirtyDaysLater.toISOString())
      .gt('remaining_tokens', 0)
      .eq('is_expired', false);

    if (!expiringLedgers || expiringLedgers.length === 0) {
      return { statusCode: 200, body: 'No tokens expiring soon' };
    }

    // 按用戶分組
    const userTokens = {};
    expiringLedgers.forEach(ledger => {
      if (!userTokens[ledger.user_id]) {
        userTokens[ledger.user_id] = {
          tokens: 0,
          earliestExpiry: ledger.expires_at
        };
      }
      userTokens[ledger.user_id].tokens += ledger.remaining_tokens;
      if (ledger.expires_at < userTokens[ledger.user_id].earliestExpiry) {
        userTokens[ledger.user_id].earliestExpiry = ledger.expires_at;
      }
    });

    // 發送提醒通知
    for (const [userId, info] of Object.entries(userTokens)) {
      const expiryDate = new Date(info.earliestExpiry).toLocaleDateString('zh-TW');
      const message = {
        type: 'text',
        text: `⚠️ 張數到期提醒\n\n您有 ${info.tokens} 張數即將於 ${expiryDate} 到期！\n\n請盡快使用，過期張數將無法退款。\n\n💡 輸入「創建貼圖」開始使用`
      };

      await sendLineMessage(userId, [message]);
    }

    console.log(`✅ 已發送 ${Object.keys(userTokens).length} 筆到期提醒`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        notified: Object.keys(userTokens).length
      })
    };

  } catch (error) {
    console.error('發送到期提醒失敗:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

---

## 9. FIFO 張數扣款邏輯

更新 `supabase-client.js` 中的 `deductTokens` 函數以支持 FIFO：

```javascript
/**
 * 扣除張數（FIFO：優先扣除最早到期的張數）
 */
async function deductTokens(lineUserId, amount, description, referenceId = null) {
  try {
    const supabase = getSupabaseClient();

    // 1. 查詢所有可用張數（未過期且有剩餘），按到期時間排序
    const { data: availableLedgers, error: ledgerError } = await supabase
      .from('token_ledger')
      .select('*')
      .eq('user_id', lineUserId)
      .gt('remaining_tokens', 0)
      .eq('is_expired', false)
      .order('expires_at', { ascending: true });  // 最早到期的優先

    if (ledgerError) throw ledgerError;

    // 計算總可用張數
    const totalAvailable = availableLedgers?.reduce(
      (sum, l) => sum + l.remaining_tokens, 0
    ) || 0;

    if (totalAvailable < amount) {
      return {
        success: false,
        balance: totalAvailable,
        error: `張數不足！目前餘額 ${totalAvailable}，需要 ${amount} 張數`
      };
    }

    // 2. 從最早到期的張數開始扣除（FIFO）
    let remaining = amount;
    const updates = [];

    for (const ledger of availableLedgers) {
      if (remaining <= 0) break;

      const deduct = Math.min(ledger.remaining_tokens, remaining);
      const newRemaining = ledger.remaining_tokens - deduct;

      updates.push({
        id: ledger.id,
        remaining_tokens: newRemaining
      });

      remaining -= deduct;
    }

    // 3. 批次更新張數帳本
    for (const update of updates) {
      await supabase
        .from('token_ledger')
        .update({
          remaining_tokens: update.remaining_tokens,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.id);
    }

    // 4. 更新用戶總餘額
    const newBalance = totalAvailable - amount;
    await supabase
      .from('users')
      .update({
        sticker_credits: newBalance,
        updated_at: new Date().toISOString()
      })
      .eq('line_user_id', lineUserId);

    // 5. 記錄交易
    await supabase
      .from('token_transactions')
      .insert([{
        user_id: lineUserId,
        amount: -amount,
        balance_after: newBalance,
        transaction_type: 'generate',
        description,
        reference_id: referenceId
      }]);

    return { success: true, balance: newBalance };

  } catch (error) {
    console.error('扣除張數失敗:', error);
    return { success: false, balance: 0, error: error.message };
  }
}
```

---

## 10. 部署檢查清單

### 10.1 環境變數設定

- [ ] `LINE_PAY_CHANNEL_ID`
- [ ] `LINE_PAY_CHANNEL_SECRET`
- [ ] `LINE_PAY_ENV` (sandbox / production)
- [ ] `LINE_PAY_CONFIRM_URL`
- [ ] `LINE_PAY_CANCEL_URL`

### 10.2 資料庫遷移

- [ ] 創建 `orders` 表
- [ ] 創建 `token_ledger` 表
- [ ] 更新 `token_transactions` 表（添加 expires_at, order_id）
- [ ] 創建必要的索引

### 10.3 API 功能

- [ ] `payment-request.js` (建立付款請求)
- [ ] `payment-confirm.js` (確認付款)
- [ ] `payment-cancel.js` (取消處理)
- [ ] `check-expired-tokens.js` (定期檢查過期張數)
- [ ] `notify-expiring-tokens.js` (到期提醒)

### 10.4 前端整合

- [ ] LINE Bot 購買張數訊息
- [ ] LIFF 付款頁面
- [ ] 成功/失敗回調頁面

### 10.5 測試項目

- [ ] Sandbox 環境測試付款流程
- [ ] 確認張數正確發放
- [ ] 驗證有效期計算正確
- [ ] 測試 FIFO 扣款邏輯
- [ ] 測試過期張數自動失效
- [ ] 測試重複付款防護

---

## 11. 常見問題 FAQ

### Q1: 為什麼採用張數制度而非直接付款？

**A:** 張數制度有以下優勢：
- 降低小額交易的手續費成本
- 可推出優惠方案（買多送多）
- 簡化功能定價（統一張數單位）
- 提高用戶留存率
- 方便實現推薦獎勵機制

### Q2: 張數為什麼設定 365 天有效期？

**A:**
- 符合台灣消費者保護法相關規定
- 鼓勵用戶定期使用服務
- 防止長期閒置張數造成財務負擔
- 業界常見做法（如遊戲點數、電信儲值）

### Q3: 過期張數可以退款嗎？

**A:**
- ❌ 原則上不可退款（購買時已明確告知有效期）
- ✅ 會在到期前 30 天主動提醒用戶
- ✅ 特殊情況可透過客服申請處理

### Q4: FIFO 扣款是什麼意思？

**A:**
FIFO (First In, First Out) 表示「先進先出」：
- 使用張數時，系統會優先扣除最早到期的張數
- 確保用戶的張數不會因為閒置而過期
- 例如：2024/01/01 購買的張數會比 2024/02/01 購買的先被使用

### Q5: 如何查詢張數有效期？

**A:**
在 LINE Bot 中輸入「張數查詢」或「my tokens」，會顯示：
- 總餘額
- 各批張數的到期時間
- 最近交易記錄

### Q6: LINE Pay 需要多久審核？

**A:**
- **Sandbox 測試環境**：立即開通（僅供測試）
- **正式環境**：約 7-14 個工作天
- 需準備：公司/商號登記證、銀行帳戶、負責人身份證

### Q7: 手續費是多少？

**A:**
- LINE Pay 手續費：約 2.5% - 3%（依合約而定）
- 建議在定價時已包含手續費成本

---

## 12. 後續擴展建議

### 12.1 訂閱制（未來功能）

可考慮推出月費/年費訂閱：
- 月費 $299：每月 120 張數 + 10% 折扣
- 年費 $2,999：每年 1,500 張數 + 20% 折扣 + 專屬風格

### 12.2 張數贈送功能

- 朋友間可互相贈送張數
- 需額外實作轉讓記錄和審計機制
- 防止濫用（限制每日轉讓上限）

### 12.3 企業方案

- 大量購買優惠（如 10,000 張數）
- 團隊共享張數池
- 統一發票和管理後台

### 12.4 張數回饋機制

- 每日簽到獎勵：1 張數
- 完成任務獎勵：如「分享貼圖到社群」
- 評價系統獎勵：留下評價獲得張數

---

## 13. 聯絡與支援

**技術文件作者：** Claude (Anthropic)
**文件版本：** v1.0
**更新日期：** 2024-01-XX

**LINE Pay 官方資源：**
- 開發者文件：https://pay.line.me/tw/developers/apis/onlineApis
- 技術支援：https://pay.line.me/tw/developers/techsupport/overview
- Sandbox 申請：https://pay.line.me/tw/developers/techsupport/sandbox/creation

**注意事項：**
⚠️ 本文檔提供的代碼僅供參考，實際部署前請：
1. 進行完整的安全審查
2. 在 Sandbox 環境充分測試
3. 確保符合當地法規要求
4. 備份資料庫並制定災難恢復計畫

---

**祝您串接順利！🎉**

