/**
 * LINE Bot Client 模組
 * 提供統一的 LINE Client 實例
 */

const line = require('@line/bot-sdk');

let client = null;

/**
 * 獲取 LINE Client 實例（單例模式）
 * @returns {line.Client}
 */
function getLineClient() {
  if (client) return client;

  const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
  };

  if (!config.channelAccessToken || !config.channelSecret) {
    console.error('❌ LINE 環境變數未設定：需要 LINE_CHANNEL_ACCESS_TOKEN 和 LINE_CHANNEL_SECRET');
    throw new Error('LINE 環境變數未設定');
  }

  client = new line.Client(config);
  console.log('✅ LINE Client 初始化成功');
  
  return client;
}

/**
 * 獲取 Channel Secret
 * @returns {string}
 */
function getChannelSecret() {
  return process.env.LINE_CHANNEL_SECRET;
}

module.exports = {
  getLineClient,
  getChannelSecret
};

