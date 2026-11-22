/**
 * Creation Flow Manager Tests
 * 測試創建流程管理功能
 */

const {
  isCreationFlowTimeout,
  cancelCreationFlow,
  addCancelButton,
  addCancelButtonToFlex
} = require('../creation-flow-manager');
const { updateConversationState, ConversationStage } = require('../conversation-state');

// Mock dependencies
jest.mock('../conversation-state');

describe('creation-flow-manager.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isCreationFlowTimeout', () => {
    it('當狀態為 null 時應該返回 false', () => {
      expect(isCreationFlowTimeout(null)).toBe(false);
    });

    it('當 updated_at 不存在時應該返回 false', () => {
      expect(isCreationFlowTimeout({})).toBe(false);
    });

    it('當階段不在創建流程中時應該返回 false', () => {
      const state = {
        current_stage: ConversationStage.IDLE,
        updated_at: new Date().toISOString()
      };
      expect(isCreationFlowTimeout(state)).toBe(false);
    });

    it('當未超時時應該返回 false', () => {
      const state = {
        current_stage: ConversationStage.STYLING,
        updated_at: new Date().toISOString() // 剛剛更新
      };
      expect(isCreationFlowTimeout(state)).toBe(false);
    });

    it('當超過 10 分鐘時應該返回 true', () => {
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
      const state = {
        current_stage: ConversationStage.STYLING,
        updated_at: elevenMinutesAgo.toISOString()
      };
      expect(isCreationFlowTimeout(state)).toBe(true);
    });

    it('應該檢查所有創建流程階段', () => {
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
      
      const stages = [
        ConversationStage.NAMING,
        ConversationStage.UPLOAD_PHOTO,
        ConversationStage.STYLING,
        ConversationStage.FRAMING,
        ConversationStage.CHARACTER,
        ConversationStage.EXPRESSIONS,
        ConversationStage.SCENE_SELECT,
        ConversationStage.CUSTOM_SCENE,
        ConversationStage.COUNT_SELECT,
        ConversationStage.CONFIRMING
      ];

      stages.forEach(stage => {
        const state = {
          current_stage: stage,
          updated_at: elevenMinutesAgo.toISOString()
        };
        expect(isCreationFlowTimeout(state)).toBe(true);
      });
    });
  });

  describe('cancelCreationFlow', () => {
    it('應該重置對話狀態並返回取消訊息', async () => {
      updateConversationState.mockResolvedValue(true);

      const result = await cancelCreationFlow('user123');

      expect(updateConversationState).toHaveBeenCalledWith(
        'user123',
        ConversationStage.IDLE,
        {}
      );
      expect(result).toEqual({
        type: 'text',
        text: expect.stringContaining('已取消創建流程')
      });
    });

    it('即使更新失敗也應該返回訊息', async () => {
      updateConversationState.mockRejectedValue(new Error('DB error'));

      await expect(cancelCreationFlow('user123')).rejects.toThrow('DB error');
      expect(updateConversationState).toHaveBeenCalled();
    });
  });

  describe('addCancelButton', () => {
    it('應該為文字訊息添加取消按鈕', () => {
      const message = {
        type: 'text',
        text: '請選擇風格'
      };

      const result = addCancelButton(message);

      expect(result).toEqual({
        type: 'text',
        text: '請選擇風格',
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'message',
                label: '❌ 取消',
                text: '取消'
              }
            }
          ]
        }
      });
    });

    it('當訊息為 null 時應該返回原訊息', () => {
      expect(addCancelButton(null)).toBe(null);
    });

    it('當訊息類型不是 text 時應該返回原訊息', () => {
      const message = {
        type: 'image',
        originalContentUrl: 'https://example.com/image.jpg',
        previewImageUrl: 'https://example.com/preview.jpg'
      };

      expect(addCancelButton(message)).toEqual(message);
    });

    it('應該保留原有的其他屬性', () => {
      const message = {
        type: 'text',
        text: '測試',
        sender: { name: 'Bot' }
      };

      const result = addCancelButton(message);

      expect(result.sender).toEqual({ name: 'Bot' });
      expect(result.quickReply).toBeDefined();
    });
  });

  describe('addCancelButtonToFlex', () => {
    it('應該為 Flex Message 添加取消按鈕', () => {
      const message = {
        type: 'flex',
        altText: '請選擇',
        contents: {
          type: 'bubble',
          body: { type: 'box', layout: 'vertical', contents: [] }
        }
      };

      const result = addCancelButtonToFlex(message);

      expect(result).toEqual({
        ...message,
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'message',
                label: '❌ 取消',
                text: '取消'
              }
            }
          ]
        }
      });
    });

    it('當訊息為 null 時應該返回 null', () => {
      expect(addCancelButtonToFlex(null)).toBe(null);
    });

    it('應該保留原有的 Flex 結構', () => {
      const complexFlex = {
        type: 'flex',
        altText: '複雜選單',
        contents: {
          type: 'carousel',
          contents: [
            { type: 'bubble', body: {} },
            { type: 'bubble', body: {} }
          ]
        }
      };

      const result = addCancelButtonToFlex(complexFlex);

      expect(result.contents).toEqual(complexFlex.contents);
      expect(result.quickReply).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 已移除：shouldDeductTokens / markTokensDeducted
  //
  // 這兩個函式從未被實作 —— 測試描述的是「先扣張數、生成失敗再退」的早期設計，
  // 後來改成「生成成功後才扣」（line-webhook 寫 tokensDeducted: false，
  // 由 sticker-generator-worker-background 呼叫 deductTokens）。
  //
  // 現行程式碼的欄位名是 camelCase `tokensDeducted`，
  // 測試用的 snake_case `tokens_deducted` 從未與實作對接。
  // 對應的建立流程 state 欄位在 functions/line-webhook.js 三處寫入但無人讀取。
  // ─────────────────────────────────────────────────────────────
});
