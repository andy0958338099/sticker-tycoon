const crypto = require('crypto');
const axios = require('axios');

const CHANNEL_ID = process.env.LINE_PAY_CHANNEL_ID;
const CHANNEL_SECRET = process.env.LINE_PAY_CHANNEL_SECRET;
const BASE_URL = process.env.LINE_PAY_BASE_URL || 'https://api-pay.line.me';

function sign(path, body, nonce) {
  const payload = CHANNEL_SECRET + path + JSON.stringify(body) + nonce;
  const hmac = crypto.createHmac('sha256', CHANNEL_SECRET);
  hmac.update(payload);
  return hmac.digest('base64');
}

async function callLinePay(path, body) {
  const nonce = String(Date.now());
  const headers = {
    'Content-Type': 'application/json',
    'X-LINE-ChannelId': CHANNEL_ID,
    'X-LINE-Authorization-Nonce': nonce,
    'X-LINE-Authorization': sign(path, body, nonce)
  };
  const res = await axios.post(`${BASE_URL}${path}`, body, { headers });
  return res.data;
}

async function requestPayment(orderId, amount, currency, productName, confirmUrl, cancelUrl) {
  const path = '/v4/payments/request';
  const body = {
    amount,
    currency,
    orderId,
    packages: [
      {
        id: 'pkg1',
        amount,
        name: 'Sticker Tycoon 方案',
        products: [{ name: productName, quantity: 1, price: amount }]
      }
    ],
    redirectUrls: { confirmUrl, cancelUrl }
  };
  return callLinePay(path, body);
}

async function confirmPayment(transactionId, amount, currency) {
  const path = `/v4/payments/${transactionId}/confirm`;
  const body = { amount, currency };
  return callLinePay(path, body);
}

// v4 check API（用來處理 1172）
async function checkPaymentRequest(transactionId, orderId) {
  const path = '/v4/payments/requests/check';
  const body = { transactionId, orderId };
  return callLinePay(path, body);
}

module.exports = {
  requestPayment,
  confirmPayment,
  checkPaymentRequest
};
