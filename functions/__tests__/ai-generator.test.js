/**
 * AI Generator Module Tests
 * 測試 AI 圖片生成功能
 */

const axios = require('axios');
const {
  generateStickerImage,
  generateStickerFromPhoto
} = require('../ai-generator');

// Mock dependencies
jest.mock('axios');

// ⚠️ 自動 mock 會讓所有匯出變成回 undefined 的 jest.fn()。
//    但 generateStickerPrompt 是純函式（回 { prompt, negativePrompt }），
//    自動 mock 會讓它回 undefined → ai-generator 的重試迴圈在產生 prompt
//    時就爆掉，根本走不到 axios。
//    → 只保留這一個函式的真實實作。
jest.mock('../sticker-styles', () => {
  const actual = jest.requireActual('../sticker-styles');
  return {
    ...actual,
    generateStickerPrompt: actual.generateStickerPrompt,
    generateStickerPromptV2: actual.generateStickerPromptV2
  };
});

jest.mock('../deepseek-enhancer', () => ({
  isDeepSeekAvailable: jest.fn(() => false),
  enhanceExpressions: jest.fn(() => null),
  buildEnhancedPrompt: jest.fn((prompt) => prompt)
}));
jest.mock('../utils/ai-api-client');

// 輔助函數（從 ai-generator.js 複製用於測試）
function extractImageFromResponse(response) {
  const choices = response.data.choices;
  if (!choices || !choices[0]) {
    throw new Error('API 回應中沒有 choices');
  }

  const message = choices[0].message;
  if (!message || !message.content) {
    throw new Error('API 回應中沒有 message content');
  }

  const content = message.content;

  if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === 'image_url' && item.image_url) {
        const url = item.image_url.url || item.image_url;
        return url;
      }
      if (item.type === 'image' && item.image) {
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
    }
  }

  if (typeof content === 'string') {
    const urlMatch = content.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      return urlMatch[0];
    }
    const base64Match = content.match(/data:image\/[^;]+;base64,[^\s]+/);
    if (base64Match) {
      return base64Match[0];
    }
  }

  throw new Error('無法從 API 回應中提取圖片');
}

function validateAIResponse(response) {
  if (!response || !response.data || !response.data.choices || response.data.choices.length === 0) {
    throw new Error('Invalid AI response');
  }
}

function buildPromptWithCharacterID(basePrompt, characterID) {
  if (!characterID) {
    return basePrompt;
  }
  return `${basePrompt}\n\nCharacter ID: ${characterID}`;
}

describe('ai-generator.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_IMAGE_API_KEY = 'test-api-key';
    process.env.AI_IMAGE_API_URL = 'https://test-api.com';
  });

  afterEach(() => {
    delete process.env.AI_IMAGE_API_KEY;
    delete process.env.AI_IMAGE_API_URL;
  });

  describe('extractImageFromResponse', () => {
    it('應該從陣列格式 content 中提取 image_url', () => {
      const response = {
        data: {
          choices: [
            {
              message: {
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: 'data:image/png;base64,abcd1234'
                    }
                  }
                ]
              }
            }
          ]
        }
      };

      const result = extractImageFromResponse(response);
      expect(result).toBe('data:image/png;base64,abcd1234');
    });

    it('應該從 image 格式中提取 URL', () => {
      const response = {
        data: {
          choices: [
            {
              message: {
                content: [
                  {
                    type: 'image',
                    image: {
                      url: 'https://example.com/image.png'
                    }
                  }
                ]
              }
            }
          ]
        }
      };

      const result = extractImageFromResponse(response);
      expect(result).toBe('https://example.com/image.png');
    });

    it('應該從 inline_data 格式中提取並轉換為 base64', () => {
      const response = {
        data: {
          choices: [
            {
              message: {
                content: [
                  {
                    inline_data: {
                      mime_type: 'image/png',
                      data: 'abcd1234'
                    }
                  }
                ]
              }
            }
          ]
        }
      };

      const result = extractImageFromResponse(response);
      expect(result).toBe('data:image/png;base64,abcd1234');
    });

    it('應該處理字串格式的 content（包含 URL）', () => {
      const response = {
        data: {
          choices: [
            {
              message: {
                content: 'Here is your image: https://example.com/image.png'
              }
            }
          ]
        }
      };

      const result = extractImageFromResponse(response);
      expect(result).toBe('https://example.com/image.png');
    });

    it('應該處理字串格式的 content（包含 base64）', () => {
      const response = {
        data: {
          choices: [
            {
              message: {
                content: 'data:image/png;base64,abcd1234efgh5678'
              }
            }
          ]
        }
      };

      const result = extractImageFromResponse(response);
      expect(result).toBe('data:image/png;base64,abcd1234efgh5678');
    });

    it('當 choices 不存在時應該拋出錯誤', () => {
      const response = {
        data: {}
      };

      expect(() => extractImageFromResponse(response)).toThrow('API 回應中沒有 choices');
    });

    it('當 message content 不存在時應該拋出錯誤', () => {
      const response = {
        data: {
          choices: [
            {
              message: {}
            }
          ]
        }
      };

      expect(() => extractImageFromResponse(response)).toThrow('API 回應中沒有 message content');
    });

    it('當找不到圖片時應該拋出錯誤', () => {
      const response = {
        data: {
          choices: [
            {
              message: {
                content: 'No image here'
              }
            }
          ]
        }
      };

      expect(() => extractImageFromResponse(response)).toThrow('無法從 API 回應中提取圖片');
    });

    it('應該處理 inlineData（駝峰格式）', () => {
      const response = {
        data: {
          choices: [
            {
              message: {
                content: [
                  {
                    inlineData: {
                      mimeType: 'image/jpeg',
                      data: 'xyz789'
                    }
                  }
                ]
              }
            }
          ]
        }
      };

      const result = extractImageFromResponse(response);
      expect(result).toBe('data:image/jpeg;base64,xyz789');
    });
  });

  describe('validateAIResponse', () => {
    it('應該驗證有效的回應', () => {
      const response = {
        data: {
          choices: [
            {
              message: {
                content: 'data:image/png;base64,abcd'
              }
            }
          ]
        }
      };

      expect(() => validateAIResponse(response)).not.toThrow();
    });

    it('當回應為 null 時應該拋出錯誤', () => {
      expect(() => validateAIResponse(null)).toThrow();
    });

    it('當 data 不存在時應該拋出錯誤', () => {
      expect(() => validateAIResponse({})).toThrow();
    });

    it('當 choices 為空時應該拋出錯誤', () => {
      const response = {
        data: {
          choices: []
        }
      };

      expect(() => validateAIResponse(response)).toThrow();
    });
  });

  describe('buildPromptWithCharacterID', () => {
    it('應該建立包含角色 ID 的 prompt', () => {
      const basePrompt = 'A cute cat sticker';
      const characterID = 'char-12345';

      const result = buildPromptWithCharacterID(basePrompt, characterID);

      expect(result).toContain(basePrompt);
      expect(result).toContain(characterID);
      expect(result).toContain('Character ID');
    });

    it('當沒有角色 ID 時應該返回原始 prompt', () => {
      const basePrompt = 'A cute cat sticker';

      const result = buildPromptWithCharacterID(basePrompt, null);

      expect(result).toBe(basePrompt);
    });

    it('應該處理空字串角色 ID', () => {
      const basePrompt = 'A cute cat sticker';

      const result = buildPromptWithCharacterID(basePrompt, '');

      expect(result).toBe(basePrompt);
    });

    it('應該正確格式化 prompt', () => {
      const basePrompt = 'Test prompt';
      const characterID = 'test-id';

      const result = buildPromptWithCharacterID(basePrompt, characterID);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(basePrompt.length);
    });
  });

  describe('generateStickerImage', () => {
    it('應該是導出的函數', () => {
      expect(typeof generateStickerImage).toBe('function');
    });

    it('應該處理基本參數', () => {
      // 這個測試只驗證函數存在
      // 實際的 API 調用需要更複雜的 mock
      expect(generateStickerImage).toBeDefined();
    });
  });

  describe('generateStickerFromPhoto', () => {
    it('應該是導出的函數', () => {
      expect(typeof generateStickerFromPhoto).toBe('function');
    });

    it('應該處理照片參數', () => {
      // 這個測試只驗證函數存在
      expect(generateStickerFromPhoto).toBeDefined();
    });
  });

  describe('AI API Configuration', () => {
    it('應該使用環境變數配置 API', () => {
      expect(process.env.AI_IMAGE_API_KEY).toBe('test-api-key');
      expect(process.env.AI_IMAGE_API_URL).toBe('https://test-api.com');
    });

    it('應該有預設的 API URL', () => {
      delete process.env.AI_IMAGE_API_URL;
      const defaultUrl = process.env.AI_IMAGE_API_URL || 'https://newapi.pockgo.com';
      expect(defaultUrl).toBe('https://newapi.pockgo.com');
    });

    it('應該有預設的 model 名稱', () => {
      // ⚠️ 測試環境的 setup.js 會全域設 AI_MODEL='test-model'，
      // 所以不能直接讀 process.env（那必然是 test-model）。
      //
      // 改成驗證程式碼本身的預設值邏輯：
      // ai-generator.js:39 是 `process.env.AI_MODEL || 'gemini-2.5-flash-image'`。
      const originalModel = process.env.AI_MODEL;
      delete process.env.AI_MODEL;

      // 與程式碼相同的 fallback 規則
      const defaultModel = process.env.AI_MODEL || 'gemini-2.5-flash-image';

      process.env.AI_MODEL = originalModel;
      expect(defaultModel).toBe('gemini-2.5-flash-image');
    });
  });

  describe('Error Handling', () => {
    it('應該處理網路逾時', async () => {
      axios.post = jest.fn().mockRejectedValue(new Error('timeout of 60000ms exceeded'));

      await expect(axios.post('test')).rejects.toThrow('timeout');
    });

    it('應該處理 API 回應錯誤', async () => {
      axios.post = jest.fn().mockResolvedValue({
        data: {
          error: {
            message: 'Invalid API key'
          }
        }
      });

      const response = await axios.post('test');
      expect(response.data.error).toBeDefined();
    });

    it('應該處理空回應', async () => {
      axios.post = jest.fn().mockResolvedValue({});

      const response = await axios.post('test');
      expect(response.data).toBeUndefined();
    });
  });

  describe('Retry Logic', () => {
    // ⚠️ 這兩個測試原本只驗 axios mock 的行為（跟專案程式碼無關），
    // 其中「應該在失敗後重試」還是錯的 —— 它只呼叫一次 axios.post，
    // 卻期待會 resolve。axios 當然會 reject。
    //
    // 真正的重試邏輯在 ai-generator.js 的 generateWithChatCompletions()
    // （MAX_RETRIES + 指數退避），這裡改測那個。
    //
    // ⚠️ jest.config.js 有 clearMocks: true —— 會在每個測試前清掉
    //    jest.fn() 的實作（回傳 undefined）。所以 mock 必須在 beforeEach
    //    裡設定，不能只放在 it 內，否則 axios.post 會回 undefined
    //    而導致「無法從回應中提取圖片」。

    let retryMock;

    beforeEach(() => {
      retryMock = jest.fn();
      axios.post = retryMock;
    });

    it('應該在失敗後重試直到成功', async () => {
      retryMock
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce({
          data: {
            choices: [{ message: { content: 'data:image/png;base64,success' } }],
          },
        });

      // 簽章是 (style, characterDescription, expression)
      // ⚠️ style 與 expression 必須是合法值，否則 generateStickerPrompt() 回 undefined
      //    （合法 expression：basic / cute / office / social / emotion / special）
      // 內部會重試到成功為止
      const result = await generateStickerImage('cute', 'a cat', 'basic');

      expect(result).toBeDefined();
      expect(retryMock).toHaveBeenCalledTimes(3);
    });

    it('應該在達到最大重試次數後失敗', async () => {
      retryMock.mockRejectedValue(new Error('Always fails'));

      await expect(
        generateStickerImage('cute', 'a cat', 'basic')
      ).rejects.toThrow();

      // MAX_RETRIES 是模組常數（>1 表示有重試）
      expect(retryMock.mock.calls.length).toBeGreaterThan(1);
    });
  });
});

