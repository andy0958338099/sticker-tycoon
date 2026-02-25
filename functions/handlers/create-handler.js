/**
 * Create Handler Module
 * 處理貼圖創建流程的各個階段
 */

const { ConversationStage, getConversationState, updateConversationState } = require('../conversation-state');
const { getOrCreateUser, getSupabaseClient } = require('../supabase-client');
const { DefaultExpressions, LineStickerSpecs, SceneTemplates, FramingTemplates } = require('../sticker-styles');
const { generateStyleSelectionFlexMessage, generateExpressionSelectionFlexMessage } = require('../sticker-flex-message');
const { generateCountSelectionMessage } = require('./messages/creation-messages');
const { generateConfirmationMessage } = require('./messages/confirmation-messages');
const { generateFramingSelectionMessage } = require('./messages/framing-messages');
const { getActiveStyles, getStyleById } = require('./messages/style-settings-messages');
const { loadFramingSettings, loadSceneSettings } = require('../style-settings-loader');

/**
 * 從資料庫取得人物大小設定（優先資料庫，否則使用預設）
 */
async function getActiveFramingTemplates() {
  try {
    const dbFraming = await loadFramingSettings();
    if (dbFraming && Object.keys(dbFraming).length > 0) {
      console.log('📐 使用資料庫人物大小設定');
      return dbFraming;
    }
  } catch (error) {
    console.error('讀取資料庫人物大小設定失敗:', error);
  }
  console.log('📐 使用預設人物大小設定');
  return FramingTemplates;
}

/**
 * 從資料庫取得裝飾繪畫風格設定（優先資料庫，否則使用預設）
 */
async function getActiveSceneTemplates() {
  try {
    const dbScenes = await loadSceneSettings();
    if (dbScenes && Object.keys(dbScenes).length > 0) {
      console.log('🎨 使用資料庫裝飾繪畫風格設定');
      return dbScenes;
    }
  } catch (error) {
    console.error('讀取資料庫裝飾繪畫風格設定失敗:', error);
  }
  console.log('🎨 使用預設裝飾繪畫風格設定');
  return SceneTemplates;
}

/**
 * 從資料庫取得表情模板設定（優先資料庫，否則使用預設）
 */

/**
 * 開始創建流程
 */
async function handleStartCreate(userId) {
  console.log(`🚀 用戶 ${userId} 開始創建貼圖`);

  // 確保用戶存在
  await getOrCreateUser(userId);

  // 更新對話狀態到命名階段
  await updateConversationState(userId, ConversationStage.NAMING, {});

  return {
    type: 'text',
    text: '🎨 開始創建你的專屬貼圖！\n\n' +
          '📝 第一步：請輸入貼圖組名稱\n\n' +
          '例如：\n' +
          '・「我的日常」\n' +
          '・「辦公室趣事」\n' +
          '・「可愛寵物」\n\n' +
          '💡 名稱最長 40 字，請盡量簡潔有創意！\n\n' +
          '➡ 讀完說明後，請往下看聊天畫面最底部的按鈕列，\n' +
          '   可以直接輸入名稱，或點選下面的範例按鈕繼續。',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '我的日常', text: '我的日常' } },
        { type: 'action', action: { type: 'message', label: '辦公室趣事', text: '辦公室趣事' } },
        { type: 'action', action: { type: 'message', label: '可愛寵物', text: '可愛寵物' } },
        { type: 'action', action: { type: 'message', label: '情侶專用', text: '情侶專用' } },
        { type: 'action', action: { type: 'message', label: '搞笑日常', text: '搞笑日常' } },
        { type: 'action', action: { type: 'message', label: '心情語錄', text: '心情語錄' } },
        { type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }
      ]
    }
  };
}

/**
 * 處理照片上傳完成
 */
async function handlePhotoUpload(userId, photoResult) {
  console.log(`📷 用戶 ${userId} 上傳照片完成`);

  // 取得當前暫存資料
  const state = await getConversationState(userId);
  const tempData = {
    ...state.temp_data,
    photoUrl: photoResult.publicUrl,
    photoPath: photoResult.storagePath,
    photoBase64: photoResult.base64
  };

  // 進入繪畫風格選擇階段
  await updateConversationState(userId, ConversationStage.STYLING, tempData);

  // 一般「創建貼圖」：維持原手動流程，讓使用者繼續選擇風格
  // 注意：爆量出圖模式的自動啟動由 line-webhook 的 handleImageMessage 統一處理
  const styles = await getActiveStyles();
  return generateStyleSelectionFlexMessage(styles);

}

/**
 * 處理命名階段
 */
async function handleNaming(userId, name) {
  console.log(`📝 用戶 ${userId} 設定名稱：${name}`);

  // 驗證名稱
  if (!name || name.length > 40) {
    return {
      type: 'text',
      text: '⚠️ 名稱請在 40 字以內，請重新輸入！',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '我的日常', text: '我的日常' } },
          { type: 'action', action: { type: 'message', label: '可愛貼圖', text: '可愛貼圖' } },
          { type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }
        ]
      }
    };
  }

  // 儲存名稱並進入照片上傳階段（保留既有 temp_data，例如 mode=quick_launch）
  const state = await getConversationState(userId);
  await updateConversationState(userId, ConversationStage.UPLOAD_PHOTO, { ...state.temp_data, name });

  return {
    type: 'text',
    text: '✅ 名稱設定完成！\n\n' +
          '📷 第二步：請上傳「一張」你的照片\n\n' +
          '⚠️ 注意：\n' +
          '• 只需 1 張「正面清晰的大頭照」（單一人像）\n' +
          '• 背景簡單、光線充足（避免多人／雜亂背景）\n' +
          '• 不要一次傳多張，避免辨識錯誤\n' +
          '• 上傳後約 1–2 分鐘生成，請耐心等待\n' +
          '• 若超過 3 分鐘無回應，可輸入「取消」重新開始\n\n' +
          '🤖 AI 會保留你的臉部特徵，生成多種表情貼圖！\n\n' +
          '➡ 要繼續，請往下看聊天畫面最底部的按鈕列，\n' +
          '   點選「📁 從相簿選擇」或「📷 拍照」上傳照片。',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'cameraRoll', label: '📁 從相簿選擇' } },
        { type: 'action', action: { type: 'camera', label: '📷 拍照' } },
        { type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }
      ]
    }
  };
}

/**
 * 處理繪畫風格選擇
 */
async function handleStyleSelection(userId, styleId) {
  console.log(`🎨 用戶 ${userId} 選擇繪畫風格：${styleId}`);

  // 從資料庫讀取繪畫風格設定
  const style = await getStyleById(styleId);
  if (!style) {
    return {
      type: 'text',
      text: '⚠️ 請選擇有效的繪畫風格！',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }
        ]
      }
    };
  }

  // 取得當前暫存資料
  const state = await getConversationState(userId);
  const tempData = { ...state.temp_data, style: styleId };

  // 如果有照片，進入人物大小選擇；否則進入角色描述
  if (tempData.photoUrl) {
    await updateConversationState(userId, ConversationStage.FRAMING, tempData);
    return generateFramingSelectionMessage(style, getActiveFramingTemplates);
  } else {
    // 舊流程：沒有照片時要求描述角色
    await updateConversationState(userId, ConversationStage.CHARACTER, tempData);
    return {
      type: 'text',
      text: `✅ 已選擇「${style.emoji} ${style.name}」繪畫風格\n\n` +
            '👤 描述你的角色\n\n' +
            '請詳細描述你想要的角色特徵，例如：\n\n' +
            '• 「一隻圓滾滾的白色小熊，有粉紅色的臉頰和小小的黑眼睛」\n\n' +
            '• 「一個戴眼鏡的上班族貓咪，穿著西裝打領帶」\n\n' +
            '💡 描述越詳細，生成的貼圖越符合你的想像！',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '🐱 可愛貓咪', text: '一隻圓滾滾的橘色小貓咪，有大大的眼睛和粉紅色的鼻子' } },
          { type: 'action', action: { type: 'message', label: '🐻 療癒小熊', text: '一隻胖嘟嘟的白色小熊，有粉紅色的臉頰和小小的黑眼睛' } },
          { type: 'action', action: { type: 'message', label: '🐰 呆萌兔子', text: '一隻長耳朵的白色兔子，眼睛是紅色的，表情呆呆的很可愛' } },
          { type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }
        ]
      }
    };
  }
}

// generateFramingSelectionMessage 已移至 ./messages/framing-messages.js

/**
 * 處理人物大小選擇
 */
async function handleFramingSelection(userId, framingId) {
  console.log(`🖼️ 用戶 ${userId} 選擇人物大小：${framingId}`);

  // 從資料庫取得人物大小設定
  const framingTemplates = await getActiveFramingTemplates();
  const framing = framingTemplates[framingId];

  if (!framing) {
    const framingOptions = Object.values(framingTemplates);
    return {
      type: 'text',
      text: '⚠️ 請選擇有效的人物大小選項！',
      quickReply: {
        items: framingOptions.map(f => ({
          type: 'action',
          action: { type: 'message', label: `${f.emoji} ${f.name}`, text: `人物大小:${f.id}` }
        }))
      }
    };
  }

  // 取得當前暫存資料
  const state = await getConversationState(userId);
  const tempData = { ...state.temp_data, framing: framingId };

  // 進入表情選擇階段
  await updateConversationState(userId, ConversationStage.EXPRESSIONS, tempData);

  // 生成表情選擇訊息（需要 await）
  const flexMessage = await generateExpressionSelectionFlexMessage();

  return {
    type: 'flex',
    altText: '選擇表情模板',
    contents: flexMessage.contents,
    quickReply: flexMessage.quickReply
  };
}

/**
 * 處理角色描述
 */
async function handleCharacterDescription(userId, description) {
  console.log(`👤 用戶 ${userId} 角色描述：${description.substring(0, 50)}...`);
  
  // 驗證描述
  if (!description || description.length < 10) {
    return {
      type: 'text',
      text: '⚠️ 請提供更詳細的角色描述（至少 10 字）！',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '🐱 可愛貓咪', text: '一隻圓滾滾的橘色小貓咪，有大大的眼睛和粉紅色的鼻子' } },
          { type: 'action', action: { type: 'message', label: '🐻 療癒小熊', text: '一隻胖嘟嘟的白色小熊，有粉紅色的臉頰和小小的黑眼睛' } },
          { type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }
        ]
      }
    };
  }
  
  // 取得當前暫存資料
  const state = await getConversationState(userId);
  const tempData = { ...state.temp_data, character: description };

  // 更新到表情選擇階段
  await updateConversationState(userId, ConversationStage.EXPRESSIONS, tempData);

  // 生成表情選擇訊息（需要 await）
  return generateExpressionSelectionFlexMessage();
}

/**
 * 隨機洗牌陣列（Fisher-Yates 演算法）
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 處理表情模板選擇（從資料庫動態載入）
 * 從模板的 24 個表情中隨機選取指定數量
 */
async function handleExpressionTemplate(userId, templateId) {
  console.log(`😀 用戶 ${userId} 選擇表情模板：${templateId}`);

  // 先從資料庫讀取
  let template = null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('expression_template_settings')
      .select('*')
      .eq('template_id', templateId)
      .eq('is_active', true)
      .single();

    if (error) {throw error;}

    if (data) {
      template = {
        id: data.template_id,
        name: data.name,
        emoji: data.emoji,
        expressions: data.expressions
      };
      console.log(`✅ 從資料庫載入表情模板: ${template.name} (${template.expressions.length}個表情)`);
    }
  } catch (error) {
    console.log(`⚠️ 從資料庫載入表情模板失敗，嘗試使用預設值: ${error.message}`);
    // 降級到硬編碼的 DefaultExpressions
    template = DefaultExpressions[templateId];
  }

  if (!template) {
    return {
      type: 'text',
      text: '⚠️ 請選擇有效的表情模板！',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }
        ]
      }
    };
  }

  // 從模板的表情池中隨機洗牌，稍後會根據選擇的數量取用
  // 先保存完整的洗牌後表情列表，在選擇數量後再取對應數量
  const shuffledExpressions = shuffleArray(template.expressions);

  // 取得當前暫存資料
  const state = await getConversationState(userId);
  const tempData = {
    ...state.temp_data,
    expressions: shuffledExpressions,  // 保存洗牌後的完整列表
    expressionTemplateId: templateId   // 保存模板 ID 以供參考
  };

  // 更新到場景選擇階段
  await updateConversationState(userId, ConversationStage.SCENE_SELECT, tempData);

  return generateSceneSelectionFlexMessage();
}

/**
 * 生成裝飾繪畫風格選擇 Flex Message（從資料庫讀取裝飾繪畫風格設定）
 */
async function generateSceneSelectionFlexMessage() {
  // 從資料庫取得裝飾繪畫風格設定
  const sceneTemplates = await getActiveSceneTemplates();
  const scenes = Object.values(sceneTemplates);

  // 排除 custom，分開處理
  const regularScenes = scenes.filter(s => s.id !== 'custom');
  const customScene = scenes.find(s => s.id === 'custom') || {
    id: 'custom',
    emoji: '✏️',
    name: '自訂繪畫風格'
  };

  // 分成兩行顯示（不包含 custom）
  const row1 = regularScenes.slice(0, 4);
  const row2 = regularScenes.slice(4);

  // Quick Reply 項目
  const quickReplyItems = scenes.map(scene => ({
    type: 'action',
    action: {
      type: 'message',
      label: `${scene.emoji} ${scene.name}`,
      text: `穿著場合:${scene.id}`
    }
  }));
  quickReplyItems.push({
    type: 'action',
    action: { type: 'message', label: '❌ 取消', text: '取消' }
  });

  return {
    type: 'flex',
    altText: '選擇穿著場合',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '🎨 選擇穿著場合', weight: 'bold', size: 'lg', color: '#FF6B6B' },
          { type: 'text', text: '為貼圖加入 POP 文字與裝飾元素', size: 'xs', color: '#888888', margin: 'sm' },
          { type: 'text', text: '（愛心、星星、對話框等）', size: 'xxs', color: '#AAAAAA', margin: 'xs' },
          { type: 'separator', margin: 'lg' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: row1.map(scene => ({
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: {
                type: 'message',
                label: `${scene.emoji} ${scene.name}`,
                text: `穿著場合:${scene.id}`
              }
            }))
          },
          ...(row2.length > 0 ? [{
            type: 'box',
            layout: 'vertical',
            margin: 'sm',
            spacing: 'sm',
            contents: row2.map(scene => ({
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: {
                type: 'message',
                label: `${scene.emoji} ${scene.name}`,
                text: `穿著場合:${scene.id}`
              }
            }))
          }] : []),
          // 自訂繪畫風格（無限延伸）- 強調色
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'message',
              label: `${customScene.emoji} ${customScene.name}（無限延伸）`,
              text: `穿著場合:${customScene.id}`
            },
            margin: 'lg',
            color: '#FF6B6B'
          }
        ]
      }
    },
    quickReply: {
      items: quickReplyItems.slice(0, 13)
    }
  };
}

/**
 * 處理裝飾繪畫風格選擇
 */
async function handleSceneSelection(userId, sceneId) {
  console.log(`🎨 用戶 ${userId} 選擇穿著場合：${sceneId}`);

  // 從資料庫取得裝飾繪畫風格設定
  const sceneTemplates = await getActiveSceneTemplates();
  const scene = sceneTemplates[sceneId];

  if (!scene) {
    return { 
      type: 'text', 
      text: '⚠️ 請選擇有效的裝飾繪畫風格！',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }
        ]
      }
    };
  }

  const state = await getConversationState(userId);

  // 如果是自訂繪畫風格，進入自訂描述階段
  if (sceneId === 'custom') {
    await updateConversationState(userId, ConversationStage.CUSTOM_SCENE, state.temp_data);
    return {
      type: 'text',
      text: '✏️ 請描述你想要的繪畫風格\n\n' +
            '🔥 熱門繪畫風格範例：\n' +
            '• 「宮崎駿吉卜力水彩風」\n' +
            '• 「Q版大頭公仔 chibi」\n' +
            '• 「Nanana Banana 香蕉人繪畫風格」\n' +
            '• 「像素風 pixel art」\n' +
            '• 「賽博龐克霓虹風」\n\n' +
            '💡 直接複製或輸入你想要的繪畫風格描述！',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '🎨 宮崎駿風', text: '宮崎駿吉卜力水彩繪畫風格，溫暖柔和的色調' } },
          { type: 'action', action: { type: 'message', label: '🎀 Q版大頭', text: 'Q版大頭公仔 chibi style，超可愛大眼睛' } },
          { type: 'action', action: { type: 'message', label: '🍌 香蕉人風', text: 'Nanana Banana 香蕉人繪畫風格，黃色系可愛' } },
          { type: 'action', action: { type: 'message', label: '👾 像素風', text: '像素風 pixel art 8-bit 復古遊戲繪畫風格' } },
          { type: 'action', action: { type: 'message', label: '💜 賽博龐克', text: '賽博龐克霓虹風，紫色藍色發光效果' } },
          { type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }
        ]
      }
    };
  }

  // 直接保存裝飾繪畫風格並進入數量選擇
  const tempData = { ...state.temp_data, scene: sceneId, sceneConfig: scene };
  await updateConversationState(userId, ConversationStage.COUNT_SELECT, tempData);

  return generateCountSelectionMessage(tempData.expressions);
}

/**
 * 處理自訂裝飾繪畫風格描述
 */
async function handleCustomScene(userId, description) {
  console.log(`✏️ 用戶 ${userId} 自訂裝飾繪畫風格：${description}`);

  const state = await getConversationState(userId);

  // 建立自訂裝飾繪畫風格配置
  const customScene = {
    id: 'custom',
    name: '自訂繪畫風格',
    emoji: '✏️',
    description: description,
    decorationStyle: description,
    decorationElements: [],
    popTextStyle: description
  };

  const tempData = { ...state.temp_data, scene: 'custom', sceneConfig: customScene, customSceneDescription: description };
  await updateConversationState(userId, ConversationStage.COUNT_SELECT, tempData);

  return generateCountSelectionMessage(tempData.expressions);
}

/**
 * 生成數量選擇訊息（6宮格批次生成優化版）
 * 每 6 張 = 1 次 API = 3 張數
 */
// generateCountSelectionMessage 已移至 ./messages/creation-messages

/**
 * 處理數量選擇
 */
async function handleCountSelection(userId, count) {
  console.log(`📊 用戶 ${userId} 選擇數量：${count}`);
  
  if (!LineStickerSpecs.validCounts.includes(count)) {
    return {
      type: 'text',
      text: '⚠️ 請選擇有效的數量！',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '6張 (6張)', text: '數量:6' } },
          { type: 'action', action: { type: 'message', label: '12張 (12張)', text: '數量:12' } },
          { type: 'action', action: { type: 'message', label: '18張 (18張)', text: '數量:18' } },
          { type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }
        ]
      }
    };
  }
  
  const state = await getConversationState(userId);
  const tempData = { ...state.temp_data, count };
  
  // 進入確認階段
  await updateConversationState(userId, ConversationStage.CONFIRMING, tempData);
  
  return generateConfirmationMessage(tempData);
}

// generateConfirmationMessage 已移至 ./messages/confirmation-messages.js

// calculateStyleCharCount / getActiveStyles 已移至 ./messages/style-settings-messages.js

// getStyleById 已移至 ./messages/style-settings-messages.js

module.exports = {
  handleStartCreate,
  handleNaming,
  handlePhotoUpload,
  handleStyleSelection,
  handleFramingSelection,
  handleCharacterDescription,
  handleExpressionTemplate,
  handleSceneSelection,
  handleCustomScene,
  handleCountSelection
};

