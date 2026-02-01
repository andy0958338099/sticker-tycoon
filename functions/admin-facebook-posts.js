/**
 * Admin Facebook Posts API
 * - 生成 Facebook 貼文文案（多主題輪替、避免重複賣點）
 *
 * 安全性：
 * - 使用 ADMIN_API_KEY（環境變數）做最小化保護
 * 
 * AI API：
 * - 使用 DEEPSEEK_API_KEY / DEEPSEEK_API_URL（專門用於文字生成）
 */

const { z } = require('zod');
const axios = require('axios');

// DeepSeek API 設定（專門用於文字生成）
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://tbnx.plus7.plus/v1/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// in-memory rate limit (best-effort; resets on cold start)
const rateLimitState = new Map();

function rateLimit(key, windowMs, max) {
  const now = Date.now();
  const hit = rateLimitState.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > hit.resetAt) {
    hit.count = 0;
    hit.resetAt = now + windowMs;
  }
  hit.count += 1;
  rateLimitState.set(key, hit);
  return hit.count <= max;
}


const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Api-Key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

function requireAdmin(event) {
  const required = process.env.ADMIN_API_KEY;
  if (!required) {
    console.warn('⚠️ ADMIN_API_KEY 未設定：管理 API 將缺少額外保護');
    return;
  }

  const key = event.headers?.['x-admin-api-key'] || event.headers?.['X-Admin-Api-Key'];
  if (!key || key !== required) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
}

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

const TOPICS = [
  {
    key: 'line-in-bot',
    label: '在 LINE 內直接操作',
    angle: '不用下載 App、不用學複雜工具，打開 LINE 就能開始做貼圖。'
  },
  {
    key: 'turn-photo-to-stickers',
    label: '照片變貼圖',
    angle: '把日常照片、寵物、家人、角色概念快速變成可用的貼圖風格。'
  },
  {
    key: 'no-design-skill',
    label: '零設計也能做',
    angle: '不會畫畫也沒關係，交給 AI 生成 + 系統整理成一套貼圖。'
  },
  {
    key: 'fast-workflow',
    label: '流程省時省力',
    angle: '省下找設計師、修圖、尺寸規格、命名打包的時間。'
  },
  {
    key: 'gift-and-fun',
    label: '送禮/社交話題',
    angle: '做一套專屬貼圖送朋友、情侶、家人，超有記憶點。'
  },
  {
    key: 'creator-monetize',
    label: '創作者上架',
    angle: '想上架但覺得麻煩？我們提供協助整理與上架流程，降低門檻。'
  },
  {
    key: 'rich-menu',
    label: 'Rich Menu / 官方帳號玩法',
    angle: '搭配官方帳號互動與選單，讓品牌更有溫度、更好玩。'
  }
];

const TONES = [
  { key: 'friendly', label: '親切' },
  { key: 'professional', label: '專業' },
  { key: 'funny', label: '幽默' },
  { key: 'story', label: '故事感' }
];

const CTA_STYLES = [
  { key: 'quick-launch', label: '🚀 極速上架（懶人專用）', description: '強調快速、省時、一鍵搞定' },
  { key: 'create-sticker', label: '🎨 創建貼圖（慢慢建立）', description: '強調客製化、創作樂趣、精心設計' },
  { key: 'coupon', label: '🎫 優惠券兌換', description: '推廣優惠券活動，引導用戶兌換免費張數' },
  { key: 'fb-follow', label: '👍 關注 FB 享驚喜', description: '引導關注 Facebook 粉絲專頁，獲得獨家優惠' },
  { key: 'line', label: '引導加入官方帳號', description: '一般引導，加入 LINE 官方帳號' },
  { key: 'link', label: '引導點擊連結', description: '引導訪問網站' },
  { key: 'comment', label: '引導留言', description: '增加互動，留言討論' },
  { key: 'dm', label: '引導私訊', description: '私訊諮詢' }
];

function pickTopic(excludeKeys = []) {
  const pool = TOPICS.filter(t => !excludeKeys.includes(t.key));
  if (pool.length === 0) return TOPICS[Math.floor(Math.random() * TOPICS.length)];
  return pool[Math.floor(Math.random() * pool.length)];
}

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [String(value)];
}

function buildPrompt({
  websiteName,
  websiteUrl,
  officialLineUrl,
  tone,
  topic,
  ctaStyle
}) {
  const toneLabel = TONES.find(t => t.key === tone)?.label || '親切';

  // 根據 CTA 風格調整引導文字
  let ctaGuidance = '';
  let specialFocus = '';
  
  if (ctaStyle === 'quick-launch') {
    specialFocus = `

🚀 **特別強調：極速上架功能**
這篇貼文要重點推廣「極速上架」功能：
- 強調「懶人專用」、「一鍵搞定」、「最快速」、「最經濟實惠」
- 說明優勢：一次生成 3 組共 54 張貼圖，完成後回補 14 張，實際只需 40 張
- 上架說明：上架需 60 張（40 張製作 + 20 張代上架），可透過「分享給好友」獲得免費張數，或「購買張數」快速取得
- 適合：想快速擁有多組貼圖、沒時間慢慢調整、追求效率的用戶
- 強調這是「最省錢的方案」，用最少張數獲得最多貼圖
- 語氣要輕鬆、強調省時省力、零門檻、超划算`;
    
    ctaGuidance = '引導用戶「加入官方帳號，輸入『極速上架』立即體驗最經濟實惠的方案」';
  } else if (ctaStyle === 'create-sticker') {
    specialFocus = `

🎨 **特別強調：創建貼圖功能**
這篇貼文要重點推廣「創建貼圖」功能：
- 強調「慢工出細活」、「客製化」、「完全掌控」
- 說明優勢：可以自己選擇風格、調整細節、一步步打造專屬貼圖
- 適合：想要精心設計、有時間慢慢調整、追求個性化的用戶
- 語氣要溫暖、強調創作樂趣、展現個性`;
    
    ctaGuidance = '引導用戶「加入官方帳號，輸入『創建貼圖』開始創作」';
  } else if (ctaStyle === 'coupon') {
    specialFocus = `

🎫 **特別強調：優惠券活動**
這篇貼文要重點推廣「優惠券兌換」功能：
- 強調「免費張數」、「限時優惠」、「先搶先贏」
- 說明如何兌換：加入官方帳號後，輸入優惠碼即可獲得免費張數
- 營造稀缺感：數量有限、活動期間限定
- 適合：想要省錢、嘗試服務、新用戶體驗
- 語氣要熱情、有急迫感、強調優惠價值`;
    
    ctaGuidance = '引導用戶「加入官方帳號，輸入優惠碼兌換免費張數」，並提醒關注粉絲專頁獲得最新優惠';
  } else if (ctaStyle === 'fb-follow') {
    specialFocus = `

👍 **特別強調：關注 Facebook 享驚喜**
這篇貼文要重點推廣「關注 FB 粉絲專頁」：
- 強調「獨家優惠」、「限定活動」、「搶先知道」
- 說明關注後的好處：定期發放優惠券、抽獎活動、創作靈感分享
- 營造社群感：加入創作者社群、看其他人的作品、互相交流
- 適合：想要持續獲得優惠、喜歡社群互動的用戶
- 語氣要親切、有社群感、強調長期價值`;
    
    ctaGuidance = '引導用戶「按讚追蹤 Facebook 粉絲專頁」，並加入官方帳號領取關注禮';
  } else {
    ctaGuidance = `引導：${ctaStyle === 'comment' ? '留言' : ctaStyle === 'dm' ? '私訊' : ctaStyle === 'link' ? '點擊連結' : '加入官方帳號'}`;
  }

  return `你是資深社群行銷文案寫手，請用「繁體中文」寫 1 篇可直接發在 Facebook 的貼文。

品牌/產品：${websiteName}
網站：${websiteUrl}
官方帳號（如需引導）：${officialLineUrl}

寫作目標：
- 不要一直重複同一個賣點
- 要逐步讓讀者接受「在 LINE 內就能操作」這件事（降低學習門檻）
- 強調這是一個能幫使用者輕鬆做出自己搞不定的 LINE 貼圖、並協助上架的服務
- 內容要真實、不浮誇，不要過度承諾
${specialFocus}

本次主題：${topic.label}
主題角度提示：${topic.angle}
語氣：${toneLabel}
CTA 引導：${ctaGuidance}

輸出格式要求：
- 第一行要有一個能抓住注意力的開場句（不要用 emoji 開頭）
- 內文 120~220 字
- 用 3~6 行短段落（手機閱讀友善）
- 只使用 0~2 個 emoji（可不用）
- 結尾要有明確 CTA（${ctaGuidance}）
- 最後附 5~10 個 hashtags（與 LINE 貼圖/AI/創作/社群相關）
- 不要提到「代幣」，統一用「張數」
`;
}

async function generatePost(event) {  
  const ip = event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for'] || 'unknown';
  if (!rateLimit(`admin-facebook-posts:${ip}`, 60 * 1000, 10)) {
    return json(429, { success: false, error: 'Rate limit exceeded' });
  }

  requireAdmin(event);

  // 檢查 DeepSeek API 是否設定
  if (!DEEPSEEK_API_KEY) {
    console.error('❌ DEEPSEEK_API_KEY 未設定');
    return json(500, { 
      success: false, 
      error: 'DeepSeek API 未設定，請在 Netlify 環境變數中設定 DEEPSEEK_API_KEY 和 DEEPSEEK_API_URL' 
    });
  }

  const schema = z.object({
    websiteName: z.string().min(1).default('貼圖大亨 Sticker Tycoon'),
    websiteUrl: z.string().min(1).default(''),
    officialLineUrl: z.string().optional().nullable().default('https://line.me/R/ti/p/@sticker-tycoon'),
    tone: z.enum(TONES.map(t => t.key)).default('friendly'),
    topicKey: z.string().optional().nullable(),
    excludeTopicKeys: z.array(z.string()).optional().nullable(),
    ctaStyle: z.enum(['comment', 'dm', 'link', 'line', 'quick-launch', 'create-sticker', 'coupon', 'fb-follow']).default('line')
  });

  const body = schema.parse(JSON.parse(event.body || '{}'));

  const excludeTopicKeys = normalizeArray(body.excludeTopicKeys);
  const requestedTopic = TOPICS.find(t => t.key === body.topicKey);
  const topic = requestedTopic || pickTopic(excludeTopicKeys);

  const prompt = buildPrompt({
    websiteName: body.websiteName,
    websiteUrl: body.websiteUrl,
    officialLineUrl: body.officialLineUrl || '',
    tone: body.tone,
    topic,
    ctaStyle: body.ctaStyle
  });

  console.log('🤖 使用 DeepSeek API 生成貼文...');
  console.log(`📝 模型: ${DEEPSEEK_MODEL}`);
  console.log(`🌐 API URL: ${DEEPSEEK_API_URL}`);

  try {
    const response = await axios.post(DEEPSEEK_API_URL, {
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是資深社群行銷文案寫手，擅長撰寫吸引人的 Facebook 貼文。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    }, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    console.log('✅ DeepSeek API 調用成功');
    console.log('📊 回應狀態:', response.status);

    // 提取內容
    const content = response.data?.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('❌ DeepSeek API 回應缺少內容');
      console.error('📋 完整回應:', JSON.stringify(response.data).substring(0, 1000));
      throw new Error('AI 回應缺少內容');
    }

    console.log('✅ 成功提取內容，長度:', content.length);

    return json(200, {
      success: true,
      topic: {
        key: topic.key,
        label: topic.label
      },
      tone: body.tone,
      post: content,
      apiUsed: 'DeepSeek'
    });

  } catch (error) {
    console.error('❌ DeepSeek API 調用失敗:', error.message);
    if (error.response) {
      console.error('📋 錯誤狀態:', error.response.status);
      console.error('📋 錯誤詳情:', JSON.stringify(error.response.data).substring(0, 1000));
    }
    throw new Error(`DeepSeek API 錯誤: ${error.message}`);
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const action = event.queryStringParameters?.action;

    if (event.httpMethod === 'POST' && action === 'generate') {
      return await generatePost(event);
    }

    if (event.httpMethod === 'GET' && action === 'meta') {
      return json(200, {
        success: true,
        topics: TOPICS,
        tones: TONES,
        ctaStyles: CTA_STYLES
      });
    }

    return json(400, { success: false, error: 'Invalid action' });
  } catch (error) {
    console.error('Admin Facebook Posts API error:', error);
    const statusCode = error.statusCode || 500;
    return json(statusCode, {
      success: false,
      error: error.message || 'Internal error',
      statusCode
    });
  }
};
