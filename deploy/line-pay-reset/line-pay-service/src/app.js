require('dotenv').config();
const express = require('express');
const routes = require('./routes');

const app = express();
app.use(express.json());

function validateEnv() {
  const required = [
    'PUBLIC_BASE_URL',
    'LINE_PAY_CHANNEL_ID',
    'LINE_PAY_CHANNEL_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET'
  ];

  const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  if (missing.length > 0) {
    throw new Error(`缺少必要環境變數: ${missing.join(', ')}`);
  }

  const base = String(process.env.PUBLIC_BASE_URL).trim();
  if (base.includes('你的網域') || base.includes('your-domain') || base.includes('orIP')) {
    throw new Error(`PUBLIC_BASE_URL 看起來仍是範例值：${base}`);
  }
  if (!/^https?:\/\//.test(base)) {
    throw new Error(`PUBLIC_BASE_URL 必須以 http:// 或 https:// 開頭：${base}`);
  }

  console.log('✅ 環境變數檢查通過', { PUBLIC_BASE_URL: base });
}

validateEnv();

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'LINE Pay backend is running' });
});

app.use(routes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 LINE Pay backend listening on port ${port}`);
});
