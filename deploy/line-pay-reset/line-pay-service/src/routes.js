const express = require('express');
const crypto = require('crypto');
const { requestPayment, confirmPayment, checkPaymentRequest } = require('./linePayClient');
const {
  getPlanConfig,
  createOrder,
  attachTransactionId,
  getOrderByOrderId,
  completeOrderAndAddTokens
} = require('./tokenService');
const { pushPaymentSuccess, pushPaymentCancelled, pushPaymentFailed } = require('./lineBotClient');

const router = express.Router();

const LINE_OA_URL = process.env.LINE_OA_URL || 'https://line.me/R/ti/p/@sticker-tycoon';

function renderRedirectPage({ title, lineOaUrl }) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", sans-serif;
    }
  </style>
  <script>
    // 嘗試自動返回 LINE 聊天
    setTimeout(() => { window.location.href = "${lineOaUrl}"; }, 80);
  </script>
</head>
<body></body>
</html>`;
}

router.post('/line-pay/request', async (req, res) => {
  try {
    const { plan, userId } = req.body || {};
    const planConfig = getPlanConfig(plan);

    if (!planConfig || !userId) {
      return res.status(400).json({ error: 'INVALID_PLAN_OR_USER' });
    }

    const orderId = `TY_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    await createOrder({
      userId,
      plan,
      amount: planConfig.amount,
      tokens: planConfig.tokens,
      orderId
    });

    const baseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    const confirmUrl = `${baseUrl}/line-pay/confirm`;
    const cancelUrl = `${baseUrl}/line-pay/cancel?orderId=${orderId}`;

    console.log('🧾 [request] create order', { userId, plan, orderId, confirmUrl, cancelUrl });

    const result = await requestPayment(
      orderId,
      planConfig.amount,
      'TWD',
      planConfig.name,
      confirmUrl,
      cancelUrl
    );

    if (result.returnCode !== '0000') {
      console.error('❌ [request] linepay request failed', result);
      return res.status(500).json({ error: 'LINE_PAY_REQUEST_FAILED', detail: result });
    }

    const { transactionId, paymentUrl } = result.info;
    await attachTransactionId(orderId, transactionId);

    console.log('✅ [request] linepay request ok', { orderId, transactionId });

    return res.json({
      orderId,
      transactionId,
      paymentUrlWeb: paymentUrl.web,
      paymentUrlApp: paymentUrl.app
    });
  } catch (err) {
    console.error('❌ /line-pay/request error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/line-pay/confirm', async (req, res) => {
  try {
    const { transactionId, orderId } = req.query;
    console.log('🔔 [confirm] hit', { transactionId, orderId, query: req.query });

    if (!transactionId || !orderId) {
      console.error('❌ [confirm] missing params', { transactionId, orderId });
      return res.status(400).send(
        renderRedirectPage({ title: '參數錯誤', lineOaUrl: LINE_OA_URL })
      );
    }

    const order = await getOrderByOrderId(orderId);
    console.log('ℹ️ [confirm] order', { exists: !!order, status: order?.status, amount: order?.amount });

    if (!order) {
      return res.status(404).send(
        renderRedirectPage({ title: '訂單不存在', lineOaUrl: LINE_OA_URL })
      );
    }

    if (order.status === 'paid') {
      return res.status(200).send(
        renderRedirectPage({ title: '已完成付款', lineOaUrl: LINE_OA_URL })
      );
    }

    const pushUserId = order.user_id;

    let confirmResult = await confirmPayment(transactionId, order.amount, 'TWD');
    console.log('ℹ️ [confirm] linepay confirm result', confirmResult);

    if (confirmResult.returnCode === '1172') {
      console.warn('⚠️ [confirm] returnCode 1172，改查 check API', { orderId, transactionId });
      const checkResult = await checkPaymentRequest(transactionId, orderId);
      console.log('ℹ️ [confirm] check result', checkResult);

      const text = JSON.stringify(checkResult).toLowerCase();
      const maybePaid = checkResult?.returnCode === '0000' && (
        text.includes('paid') || text.includes('capture') || text.includes('success')
      );

      if (!maybePaid) {
        if (pushUserId) {
          await pushPaymentFailed(pushUserId);
        }

        return res.status(400).send(
          renderRedirectPage({ title: '付款未完成', lineOaUrl: LINE_OA_URL })
        );
      }
    } else if (confirmResult.returnCode !== '0000') {
      console.error('❌ [confirm] linepay confirm failed', confirmResult);

      if (pushUserId) {
        await pushPaymentFailed(pushUserId);
      }

      return res.status(400).send(
        renderRedirectPage({ title: '付款確認失敗', lineOaUrl: LINE_OA_URL })
      );
    }

    const { order: updatedOrder, user_balance, alreadyProcessed } = await completeOrderAndAddTokens(orderId);
    console.log('✅ [confirm] token topup done', {
      orderId,
      alreadyProcessed,
      userId: updatedOrder?.user_id,
      amount: updatedOrder?.amount,
      tokens: updatedOrder?.tokens,
      user_balance
    });

    if (!alreadyProcessed) {
      await pushPaymentSuccess(
        updatedOrder.user_id,
        updatedOrder.amount,
        updatedOrder.tokens,
        user_balance
      );
      console.log('✅ [confirm] push message sent', { userId: updatedOrder.user_id });
    }

    return res.status(200).send(
      renderRedirectPage({ title: '付款成功', lineOaUrl: LINE_OA_URL })
    );
  } catch (err) {
    console.error('❌ [confirm] unexpected error:', err);
    return res.status(500).send(
      renderRedirectPage({ title: '系統忙碌中', lineOaUrl: LINE_OA_URL })
    );
  }
});

router.get('/line-pay/cancel', async (req, res) => {
  try {
    const { orderId } = req.query || {};

    if (orderId) {
      const order = await getOrderByOrderId(orderId);
      if (order?.user_id) {
        await pushPaymentCancelled(order.user_id);
      }
    }
  } catch (err) {
    console.error('❌ [cancel] push cancelled message failed:', err);
  }

  return res.status(200).send(
    renderRedirectPage({ title: '已取消付款', lineOaUrl: LINE_OA_URL })
  );
});

module.exports = router;
