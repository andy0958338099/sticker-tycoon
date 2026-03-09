const line = require('@line/bot-sdk');

const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

async function pushMessageWithActions(userId, text) {
  if (!userId) return;

  await client.pushMessage(userId, {
    type: 'text',
    text,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '🚀 爆量出圖',
            text: '爆量出圖'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '🎨 創建貼圖',
            text: '創建貼圖'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '🎁 分享給好友',
            text: '分享給好友'
          }
        }
      ]
    }
  });
}

function buildPaymentStatusText(title, detailLines, endingLine) {
  const details = detailLines.filter(Boolean).join('\n');
  return `${title}\n${details}\n\n${endingLine}`;
}

async function pushPaymentSuccess(userId, amount, tokens, newBalance) {
  const balanceLine = Number.isFinite(newBalance)
    ? `目前餘額：${newBalance} 張`
    : '';

  const text = buildPaymentStatusText(
    '✅ 付款成功',
    [
      `已收到 NT$${amount}`,
      `已新增 ${tokens} 張到你的貼圖張數`,
      balanceLine,
    ],
    '你可以直接用下方功能開始製作。'
  );

  await pushMessageWithActions(userId, text);
}

async function pushPaymentCancelled(userId) {
  const text = buildPaymentStatusText(
    '⚠️ 已取消付款',
    ['本次交易未扣款、也未入帳。'],
    '你可以直接用下方功能繼續製作。'
  );

  await pushMessageWithActions(userId, text);
}

async function pushPaymentFailed(userId) {
  const text = buildPaymentStatusText(
    '❌ 付款確認失敗',
    ['系統暫時無法完成入帳，請稍後再試一次。'],
    '你可以先用下方功能繼續製作，或稍後再購買張數。'
  );

  await pushMessageWithActions(userId, text);
}

module.exports = { pushPaymentSuccess, pushPaymentCancelled, pushPaymentFailed };
