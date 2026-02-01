/**
 * 早安圖生成 Background Function
 * 由 LINE Webhook 觸發，在背景執行生成任務
 */

const { forceGenerateMorningGreeting } = require('./morning-greeting');
const { getLineClient } = require('./line-client');

exports.handler = async function(event, context) {
  console.log('🌅 Background: 開始生成早安圖');
  
  try {
    // 解析請求參數
    const body = JSON.parse(event.body || '{}');
    const userId = body.userId;
    
    if (!userId) {
      console.error('❌ 缺少 userId 參數');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing userId' })
      };
    }
    
    console.log(`👤 為用戶 ${userId} 生成早安圖`);
    
    // 執行生成
    const result = await forceGenerateMorningGreeting();
    
    console.log(`📊 生成結果: ${JSON.stringify(result)}`);
    
    // 發送結果通知給用戶
    const lineClient = getLineClient();
    
    if (result.success) {
      await lineClient.pushMessage(userId, {
        type: 'text',
        text: `✅ 今日早安圖已生成完成！\n\n請輸入「早安圖」查看。`,
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '🌅 查看早安圖', text: '早安圖' } },
            { type: 'action', action: { type: 'message', label: '🎨 創建貼圖', text: '創建貼圖' } },
            { type: 'action', action: { type: 'message', label: '📁 我的貼圖', text: '我的貼圖' } }
          ]
        }
      });
    } else {
      await lineClient.pushMessage(userId, {
        type: 'text',
        text: `❌ 早安圖生成失敗\n\n錯誤訊息：${result.message}\n\n請稍後再試，或聯繫客服。`,
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '🔄 重試', text: '重新生成早安圖' } },
            { type: 'action', action: { type: 'message', label: '🎨 創建貼圖', text: '創建貼圖' } }
          ]
        }
      });
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: result.success,
        message: result.message,
        imageUrl: result.imageUrl
      })
    };
    
  } catch (error) {
    console.error('❌ Background 生成失敗:', error);
    
    // 嘗試通知用戶
    try {
      const body = JSON.parse(event.body || '{}');
      const userId = body.userId;
      
      if (userId) {
        const lineClient = getLineClient();
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `❌ 早安圖生成時發生錯誤\n\n${error.message}\n\n請稍後再試。`
        });
      }
    } catch (notifyError) {
      console.error('❌ 發送錯誤通知失敗:', notifyError);
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};

