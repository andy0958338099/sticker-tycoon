/**
 * AI API Client with Fallback
 * 統一的 AI API 調用模組，支援主模型 + 備用模型自動切換
 *
 * newapi.pockgo.com 的 /v1/chat/completions 在不同情境下可能要求 `messages` 或 `contents`。
 * 這裡做雙格式自動 fallback：先試 messages，再試 contents；若回傳明確指出缺哪個欄位則立即切換。
 *
 * 環境變數設定（Netlify）：
 * - AI_IMAGE_API_KEY: API 金鑰
 * - AI_IMAGE_API_URL: API 基礎 URL
 * - AI_MODEL_3: 主要模型（優先使用）
 * - AI_MODEL: 備用模型（AI_MODEL_3 失敗時使用）
 *
 * 調用順序：AI_MODEL_3 → AI_MODEL
 */

const axios = require('axios');

// 從環境變數讀取設定
const AI_API_KEY = process.env.AI_IMAGE_API_KEY;
const AI_API_URL = process.env.AI_IMAGE_API_URL || 'https://newapi.pockgo.com';
// 🔄 調用順序：AI_MODEL_3 優先，AI_MODEL 備用
const AI_MODEL_PRIMARY = process.env.AI_MODEL_3 || 'gemini-3-pro-image-preview-2k';
const AI_MODEL_FALLBACK = process.env.AI_MODEL || 'gemini-2.5-flash-image';

// 預設設定
const DEFAULT_TIMEOUT = 120000; // 2 分鐘
const DEFAULT_MAX_TOKENS = 4096;
const RETRY_DELAY = 3000; // 3 秒

/**
 * 延遲函數
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 從文字中提取圖片 URL
 */
function extractUrlFromText(text) {
  const markdownMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
  if (markdownMatch) {
    return markdownMatch[1];
  }

  const urlMatch = text.match(/(https?:\/\/[^\s]+\.(png|jpg|jpeg|webp|gif))/i);
  if (urlMatch) {
    return urlMatch[1];
  }

  const anyUrlMatch = text.match(/(https?:\/\/[^\s\)\]"']+)/);
  if (anyUrlMatch) {
    return anyUrlMatch[1];
  }

  return null;
}

/**
 * 從 Chat Completions 回應中提取圖片
 */
function extractImageFromResponse(response) {
  const data = response?.data;
  const choices = data?.choices;

  if (!choices || !choices[0]) {
    console.log('🔍 API 回應結構:', JSON.stringify(data).substring(0, 800));
    throw new Error('API 回應中沒有 choices');
  }

  const message = choices[0].message;
  if (!message || !message.content) {
    console.log('🔍 Message 結構:', JSON.stringify(message).substring(0, 800));
    throw new Error('API 回應中沒有 message content');
  }

  const content = message.content;

  if (Array.isArray(content)) {
    for (const item of content) {
      if (item?.type === 'image_url' && item.image_url) {
        const url = item.image_url.url || item.image_url;
        if (typeof url === 'string' && url.length > 0) {
          return url;
        }
      }

      if (item?.type === 'image' && item.image) {
        if (item.image.url) {
          return item.image.url;
        }
        if (item.image.data) {
          const mimeType = item.image.mime_type || 'image/png';
          return `data:${mimeType};base64,${item.image.data}`;
        }
      }

      if (item.inline_data || item.inlineData) {
        const inlineData = item.inline_data || item.inlineData;
        const mimeType = inlineData.mime_type || inlineData.mimeType || 'image/png';
        return `data:${mimeType};base64,${inlineData.data}`;
      }

      if (item?.type === 'text' && typeof item.text === 'string') {
        const url = extractUrlFromText(item.text);
        if (url) {
          return url;
        }
      }
    }
  }

  if (typeof content === 'string') {
    if (content.startsWith('data:image')) {
      return content;
    }
    if (content.startsWith('http')) {
      return content;
    }
    const url = extractUrlFromText(content);
    if (url) {
      return url;
    }
  }

  console.log('🔍 無法解析的 message.content:', JSON.stringify(content).substring(0, 800));
  throw new Error('無法從回應中提取圖片');
}

/**
 * 將標準 messages 縮減為 pockgo 可能接受的 contents 形式
 */
function messagesToContents(messages) {
  const firstUser = messages?.find(m => m?.role === 'user');
  const content = firstUser?.content;

  if (Array.isArray(content)) {
    return content;
  }

  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  return [{ type: 'text', text: JSON.stringify(messages) }];
}

function isMissingField(errorMsg, fieldName) {
  return typeof errorMsg === 'string' && errorMsg.includes(`field ${fieldName} is required`);
}

function isContentsRequired(errorMsg) {
  return typeof errorMsg === 'string' && errorMsg.includes('contents is required');
}

/**
 * 🎯 核心：帶 Fallback 的 Chat Completions 調用
 */
async function callChatWithFallback(messages, options = {}) {
  const {
    maxRetries = 2,
    timeout = DEFAULT_TIMEOUT,
    maxTokens = DEFAULT_MAX_TOKENS
  } = options;

  if (!AI_API_KEY) {
    throw new Error('AI_IMAGE_API_KEY 未設定');
  }

  const models = [
    { name: AI_MODEL_PRIMARY, label: '主要模型' },
    { name: AI_MODEL_FALLBACK, label: '備用模型' }
  ];

  let lastError = null;

  // 供應商端目前要求使用 messages；禁用 contents 以避免固定 500 噪音與無效重試
  const requestBodyCandidates = [
    { kind: 'messages', build: modelName => ({ model: modelName, messages, max_tokens: maxTokens }) }
  ];

  for (const model of models) {
    console.log(`🤖 嘗試 ${model.label}: ${model.name}`);

    for (const candidate of requestBodyCandidates) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`   📤 請求 ${attempt}/${maxRetries}...`);

          const requestBody = candidate.build(model.name);

          console.log(`   🧾 Endpoint: /v1/chat/completions`);
          console.log(`   🧾 Payload kind: ${candidate.kind}`);
          console.log(`   🧾 Request keys: ${Object.keys(requestBody).sort().join(', ')}`);
          if (Array.isArray(requestBody.contents)) {
            console.log(`   🧾 contents items: ${requestBody.contents.length}`);
          }

          const response = await axios.post(
            `${AI_API_URL}/v1/chat/completions`,
            requestBody,
            {
              headers: {
                'Authorization': `Bearer ${AI_API_KEY}`,
                'Content-Type': 'application/json'
              },
              timeout
            }
          );

          console.log(`   ✅ ${model.label} 成功！(狀態: ${response.status})`);
          return {
            response,
            modelUsed: model.name,
            isFallback: model.name === AI_MODEL_FALLBACK
          };

        } catch (error) {
          lastError = error;
          const statusCode = error.response?.status;
          const errorMsg = error.response?.data?.error?.message || error.message;

          console.error(`   ❌ ${model.label} 失敗 (${attempt}/${maxRetries}) [${candidate.kind}]: ${statusCode || 'N/A'} - ${errorMsg}`);
          if (error.response?.data) {
            console.error(`   🔎 API response data: ${JSON.stringify(error.response.data).substring(0, 2000)}`);
          }

          // 立即切換策略：如果缺 messages，就不要再重試 contents；反之亦然。
          if (isMissingField(errorMsg, 'messages')) {
            if (candidate.kind !== 'messages') {
              console.log('   🔁 偵測到 field messages is required，改用 messages payload...');
            }
            break;
          }

          if (isContentsRequired(errorMsg)) {
            if (candidate.kind !== 'contents') {
              console.log('   🔁 偵測到 contents is required，改用 contents payload...');
            }
            break;
          }

          // 429 或 5xx 才等候重試
          if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
            if (attempt < maxRetries) {
              const waitTime = RETRY_DELAY * attempt;
              console.log(`   ⏳ 等待 ${waitTime / 1000} 秒後重試...`);
              await delay(waitTime);
              continue;
            }
          }

          break;
        }
      }
    }

    console.log(`   🔄 切換到下一個模型...`);
  }

  throw new Error(`所有 AI 模型都失敗: ${lastError?.message || '未知錯誤'}`);
}

/**
 * 🖼️ 生成圖片（text-to-image，Chat 形式）
 */
async function generateImage(prompt, options = {}) {
  const messages = [
    {
      role: 'user',
      content: prompt
    }
  ];

  const result = await callChatWithFallback(messages, options);
  const imageUrl = extractImageFromResponse(result.response);

  if (result.isFallback) {
    console.log(`   ⚠️ 注意：使用了備用模型 (${result.modelUsed})`);
  }

  return imageUrl;
}

/**
 * 🖼️ 使用照片生成圖片（Chat 形式）
 */
async function generateImageFromPhoto(photoBase64, prompt, options = {}) {
  const dataUrl = photoBase64?.startsWith('data:') ? photoBase64 : `data:image/jpeg;base64,${photoBase64}`;

  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: dataUrl
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ]
    }
  ];

  const result = await callChatWithFallback(messages, options);
  const imageUrl = extractImageFromResponse(result.response);

  if (result.isFallback) {
    console.log(`   ⚠️ 注意：使用了備用模型 (${result.modelUsed})`);
  }

  return imageUrl;
}

/**
 * 獲取當前設定資訊
 */
function getAIConfig() {
  return {
    apiUrl: AI_API_URL,
    primaryModel: AI_MODEL_PRIMARY,
    fallbackModel: AI_MODEL_FALLBACK,
    hasApiKey: !!AI_API_KEY
  };
}

module.exports = {
  callChatWithFallback,
  generateImage,
  generateImageFromPhoto,
  extractImageFromResponse,
  extractUrlFromText,
  getAIConfig,
  delay
};
