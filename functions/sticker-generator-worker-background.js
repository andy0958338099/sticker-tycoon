/**
 * Sticker Generator Worker
 * 異步執行貼圖生成任務
 */

const { v4: uuidv4 } = require('uuid');
const { getSupabaseClient, updateStickerSetStatus, getStickerSet, deductTokens, addTokens, getUserTokenBalance } = require('./supabase-client');
const { generateStickerSet, generateStickerSetFromPhoto } = require('./ai-generator');
const { generateStickersIntelligent } = require('./sticker-generator-enhanced');
const { processStickerSet, generateMainImage, generateTabImage } = require('./image-processor');
const { DefaultExpressions, loadStylesFromDatabase } = require('./sticker-styles');

/**
 * 建立生成任務
 */
async function createGenerationTask(userId, setData) {
  const supabase = getSupabaseClient();
  const taskId = uuidv4();
  const setId = uuidv4();

  try {
    // 計算需要的張數（新制度：1張貼圖 = 1張數）
    // ⚠️ 使用 ?? 而不是 || 來避免 0 被當作 falsy
    const stickerCount = setData.count ?? 6;
    const tokenCost = setData.tokenCost ?? stickerCount;  // ✅ 直接等於張數

    // ✅ 改為：暫不扣除張數，等生成成功後再扣
    // 🚀 極速上架：count=0, tokenCost=0（master 任務不扣張數）
    if (tokenCost > 0) {
      console.log(`💰 待扣除 ${tokenCost} 張（生成成功後扣除）`);
    } else {
      console.log(`📋 Master 任務（count=${stickerCount}, tokenCost=${tokenCost}），不扣除張數`);
    }

    // 🆕 生成角色一致性 ID（確保同一組貼圖使用相同角色）
    const { generateCharacterID } = require('./sticker-styles');
    let characterId = null;
    if (setData.photoBase64) {
      characterId = generateCharacterID(setData.photoBase64.slice(0, 1000) + setData.style);
      console.log(`🎭 生成角色 ID: ${characterId}`);
    }

    // 建立貼圖組記錄（包含用戶選擇的表情和場景）
    const { error: setError } = await supabase
      .from('sticker_sets')
      .insert([{
        set_id: setId,
        user_id: userId,
        name: setData.name,
        description: setData.description || '',
        style: setData.style,
        character_prompt: setData.character || '',  // 照片流程可能沒有
        photo_url: setData.photoUrl || null,        // 照片 URL
        photo_base64: setData.photoBase64 || null,  // 照片 Base64（用於 AI 生成）
        sticker_count: setData.count,
        expressions: JSON.stringify(setData.expressions || []), // 用戶選擇的表情列表
        scene: setData.scene || 'none',             // 場景 ID
        scene_config: setData.sceneConfig ? JSON.stringify(setData.sceneConfig) : null, // 場景配置
        character_id: characterId,                  // 🆕 角色一致性 ID
        framing: setData.framing || 'halfbody',     // 構圖選擇（全身/半身/大頭/特寫）
        status: 'generating',
        tokens_used: tokenCost,  // ✅ 修正：記錄實際消耗的張數數（而非貼圖數量）
        promotion: setData.promotion || null
      }]);

    if (setError) throw setError;

    // 建立任務記錄
    const { error: taskError } = await supabase
      .from('generation_tasks')
      .insert([{
        task_id: taskId,
        user_id: userId,
        set_id: setId,
        task_type: setData.taskType || 'create_set',
        status: 'pending',
        progress: 0
      }]);

    // DB 已加上 partial unique index：同一 user 同時只能有一筆 pending/processing
    // 若使用者連點/多 instance 並發，這裡會觸發唯一性錯誤
    if (taskError) {
      // 避免留下孤兒 sticker_set
      try {
        await supabase
          .from('sticker_sets')
          .delete()
          .eq('set_id', setId);
      } catch (cleanupError) {
        console.error('⚠️ 清理 sticker_set 失敗:', cleanupError.message);
      }

      throw taskError;
    }

    console.log(`✅ 已建立生成任務：${taskId}, 貼圖組：${setId}`);
    return { taskId, setId };

  } catch (error) {
    console.error('❌ 建立任務失敗:', error);
    throw error;
  }
}

/**
 * 更新任務進度
 */
async function updateTaskProgress(taskId, progress, status = 'processing') {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('generation_tasks')
      .update({
        progress,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('task_id', taskId);

    if (error) throw error;
    console.log(`📊 任務 ${taskId} 進度：${progress}%`);
  } catch (error) {
    console.error('❌ 更新進度失敗:', error);
  }
}

/**
 * 執行貼圖生成
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function pickRandomIdFromRecord(record) {
  const keys = Object.keys(record || {});
  if (keys.length === 0) return null;
  const idx = Math.floor(Math.random() * keys.length);
  return keys[idx];
}

function pickRandomFromArray(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

async function loadQuickLaunchPickPools() {
  const { getActiveStyles } = require('./handlers/messages/style-settings-messages');
  const { loadExpressionTemplateSettings, loadSceneSettings, loadFramingSettings } = require('./style-settings-loader');
  const { StickerStyles, SceneTemplates, FramingTemplates } = require('./sticker-styles');

  const styles = await getActiveStyles();
  const framingSettings = (await loadFramingSettings()) || FramingTemplates;
  const sceneSettings = (await loadSceneSettings()) || SceneTemplates;
  const expressionTemplates = (await loadExpressionTemplateSettings()) || DefaultExpressions;

  return { styles, framingSettings, sceneSettings, expressionTemplates };
}

async function executeQuickLaunch(taskId, masterSetId) {
  const supabase = getSupabaseClient();

  try {
    console.log(`🚀 開始執行極速上架任務：${taskId}`);

    await loadStylesFromDatabase();
    await updateTaskProgress(taskId, 5, 'processing');

    const masterSet = await getStickerSet(masterSetId);
    if (!masterSet) throw new Error('找不到 master 貼圖組資料');

    const userId = masterSet.user_id;

    const promotion = masterSet.promotion ? JSON.parse(masterSet.promotion) : null;
    if (!promotion || promotion.id !== 'quick_launch_v1') {
      throw new Error('master 任務缺少 promotion 設定');
    }

    const groupKey = promotion.groupKey;
    const totalSets = Number(promotion.totalSets) || 3;
    const setSize = Number(promotion.setSize) || 18;
    const refundTokens = Number(promotion.refundTokens) || 14;

    const hasPhoto = masterSet.photo_base64 || masterSet.photo_url;
    if (!hasPhoto) throw new Error('master 任務缺少照片');

    // 極速上架：總計 3*18=54，預檢餘額避免中途不足
    const totalCost = totalSets * setSize;
    const tokenBalance = await getUserTokenBalance(userId);
    if (tokenBalance < totalCost) {
      throw new Error(`張數不足：需要 ${totalCost}，目前 ${tokenBalance}`);
    }

    // 把 master set 標記 completed（它不產圖，只做承載任務資料）
    await updateStickerSetStatus(masterSetId, 'completed');

    const pools = await loadQuickLaunchPickPools();

    const createdSetIds = [];

    for (let i = 0; i < totalSets; i++) {
      const progressBase = 10 + Math.floor((i / totalSets) * 80);
      await updateTaskProgress(taskId, progressBase, 'processing');

      // 每組重新隨機參數
      const pickedStyle = pickRandomFromArray(pools.styles);
      const styleId = pickedStyle?.style_id || pickedStyle?.id;

      const framingId = pickRandomIdFromRecord(pools.framingSettings) || 'halfbody';

      const sceneId = pickRandomIdFromRecord(pools.sceneSettings) || 'none';
      const sceneConfig = sceneId !== 'none' ? pools.sceneSettings[sceneId] : null;

      const templateId = pickRandomIdFromRecord(pools.expressionTemplates) || 'basic';
      const expressionPool =
        (pools.expressionTemplates[templateId]?.expressions) ||
        DefaultExpressions.basic.expressions;

      const expressions = shuffleArray(expressionPool).slice(0, setSize);

      const setName = `極速上架-${String(i + 1).padStart(2, '0')}`;

      const childSetId = uuidv4();

      // 直接建立 sticker_set（不建立 generation_tasks，避免觸發同 user 只能 1 筆 pending/processing 的限制）
      const { generateCharacterID } = require('./sticker-styles');
      const characterId = masterSet.photo_base64
        ? generateCharacterID(masterSet.photo_base64.slice(0, 1000) + styleId)
        : null;

      const { error: insertChildSetError } = await supabase
        .from('sticker_sets')
        .insert([{
          set_id: childSetId,
          user_id: userId,
          name: setName,
          description: '',
          style: styleId,
          character_prompt: '',
          photo_url: masterSet.photo_url || null,
          photo_base64: masterSet.photo_base64 || null,
          sticker_count: setSize,
          expressions: JSON.stringify(expressions),
          scene: sceneId,
          scene_config: sceneConfig ? JSON.stringify(sceneConfig) : null,
          character_id: characterId,
          framing: framingId,
          status: 'generating',
          tokens_used: setSize,
          promotion: JSON.stringify({
            id: 'quick_launch_v1',
            groupKey,
            isLast: i === totalSets - 1,
            refundTokens: i === totalSets - 1 ? refundTokens : 0
          })
        }]);

      if (insertChildSetError) throw insertChildSetError;

      // 直接重用既有 executeGeneration 流程來生成這一組（使用 master taskId 追蹤進度）
      await executeGeneration(taskId, childSetId);

      createdSetIds.push(childSetId);
    }

    await updateTaskProgress(taskId, 100, 'completed');

    return {
      success: true,
      mode: 'quick_launch',
      masterSetId,
      createdSetIds
    };
  } catch (error) {
    console.error(`❌ 極速上架任務失敗 (${taskId}):`, error);

    await supabase
      .from('generation_tasks')
      .update({
        status: 'failed',
        error_message: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('task_id', taskId);

    throw error;
  }
}

async function executeGeneration(taskId, setId) {
  const supabase = getSupabaseClient();

  try {
    console.log(`🚀 開始執行生成任務：${taskId}`);

    // 🆕 從資料庫載入最新的風格設定
    console.log(`📥 載入資料庫風格設定...`);
    await loadStylesFromDatabase();

    // 立即更新狀態為 processing（從 pending 變成 processing）
    await updateTaskProgress(taskId, 5, 'processing');
    console.log(`📊 任務狀態已更新為 processing`);

    // 取得貼圖組資料
    const stickerSet = await getStickerSet(setId);
    if (!stickerSet) {
      throw new Error('找不到貼圖組資料');
    }

    const {
      user_id: userId,
      style,
      character_prompt,
      sticker_count,
      photo_base64,
      expressions: expressionsJson,
      scene,
      scene_config: sceneConfigJson,
      character_id: savedCharacterId,  // 🆕 讀取保存的角色 ID
      framing
    } = stickerSet;

    // 詳細日誌
    console.log(`📋 貼圖組資料：style=${style}, count=${sticker_count}`);
    console.log(`📋 photo_base64 長度: ${photo_base64 ? photo_base64.length : 0}`);
    console.log(`📋 character_prompt: ${character_prompt || '(無)'}`);
    console.log(`📋 expressions JSON: ${expressionsJson || '(無)'}`);
    console.log(`📋 scene: ${scene || 'none'}`);
    console.log(`📋 character_id: ${savedCharacterId || '(無)'}`);  // 🆕 記錄角色 ID
    console.log(`📋 framing: ${framing || 'halfbody'}`);

    // 解析場景配置
    let sceneConfig = null;
    if (sceneConfigJson) {
      try {
        sceneConfig = JSON.parse(sceneConfigJson);
        console.log(`🌍 使用場景: ${sceneConfig.name} (${sceneConfig.id})`);
      } catch (e) {
        console.log(`⚠️ 解析場景JSON失敗: ${e.message}`);
      }
    }

    // 取得表情列表：優先使用用戶選擇的，否則使用基本日常
    let expressions;
    if (expressionsJson) {
      try {
        expressions = JSON.parse(expressionsJson);
        console.log(`✅ 使用用戶選擇的表情: ${expressions.join(', ')}`);
      } catch (e) {
        console.log(`⚠️ 解析表情JSON失敗，使用預設: ${e.message}`);
        expressions = DefaultExpressions.basic.expressions;
      }
    } else {
      expressions = DefaultExpressions.basic.expressions;
      console.log(`⚠️ 無用戶表情，使用預設基本日常`);
    }

    // 根據數量截取
    expressions = expressions.slice(0, sticker_count);
    console.log(`📋 最終表情列表 (${expressions.length} 個): ${expressions.join(', ')}`);

    // 計算需要的張數（新制度：1張貼圖 = 1張數）
    const actualCount = expressions.length;
    const tokenCost = actualCount;  // ✅ 直接等於張數
    console.log(`💰 本次生成需要 ${tokenCost} 張（${actualCount}張貼圖 = ${tokenCost}張數）`);

    // 更新進度：開始 AI 生成
    await updateTaskProgress(taskId, 10, 'processing');

    // 1. AI 生成圖片（使用智能生成器自動選擇最優模式）
    console.log(`🎨 開始 AI 生成 ${sticker_count} 張貼圖...`);
    let generatedImages;

    if (photo_base64) {
      // 照片流程：使用智能生成器（自動判斷是否用6宮格）
      console.log('📷 使用智能生成器（照片模式）');

      // 🆕 修改：只要表情數量 >= 6 就使用 6宮格模式
      const actualCount = expressions.length;
      const useGridMode = actualCount >= 6 ? 'auto' : 'never';

      if (useGridMode === 'auto') {
        const batchCount = Math.ceil(actualCount / 6);
        console.log(`🎨 使用 6宮格批次模式（${actualCount}張 = ${batchCount}次API，每6張=3張數）`);
      } else {
        console.log(`📌 使用傳統模式（${actualCount}張，少於6張）`);
      }

      generatedImages = await generateStickersIntelligent(photo_base64, style, expressions, {
        userId,
        setId,
        useGridMode,      // 'auto' 或 'never'
        sceneConfig,
        framingId: framing,
        characterID: savedCharacterId  // 🆕 傳入保存的角色 ID
      });
    } else {
      // 傳統流程：使用角色描述生成（不支持網格模式）
      console.log('✏️ 使用角色描述模式生成');
      generatedImages = await generateStickerSet(style, character_prompt, expressions);
    }

    // 詳細日誌 - 生成結果
    console.log(`📊 AI 生成結果：${JSON.stringify(generatedImages.map(img => ({
      index: img.index,
      status: img.status,
      hasUrl: !!img.imageUrl,
      hasBuffer: !!img.buffer,
      mode: img.mode || 'traditional'
    })))}`);
    await updateTaskProgress(taskId, 50, 'processing');

    // 2. 處理圖片（符合 LINE 規格）
    const successImages = generatedImages.filter(img => img.status === 'completed');

    // 🆕 處理不同格式的結果（網格模式返回 storagePath，傳統模式返回 imageUrl）
    const imageUrls = [];
    const storageProcessed = [];  // 已經處理並上傳的圖片（網格模式）

    for (const img of successImages) {
      if (img.storagePath) {
        // 網格模式：已經處理並上傳（storagePath 存在即可）
        storageProcessed.push(img);
      } else if (img.imageUrl) {
        // 傳統模式：需要處理
        imageUrls.push(img.imageUrl);
      }
    }

    console.log(`📊 成功的圖片: ${successImages.length} 張`);
    console.log(`   - 網格模式（已處理）: ${storageProcessed.length} 張`);
    console.log(`   - 傳統模式（待處理）: ${imageUrls.length} 張`);

    // 檢查是否有成功生成的圖片
    if (successImages.length === 0) {
      const failedReasons = generatedImages.filter(img => img.status === 'failed').map(img => img.error).join('; ');
      throw new Error(`所有圖片生成失敗：${failedReasons || 'API 錯誤'}`);
    }

    // 處理傳統模式的圖片
    let processedImages = [];
    if (imageUrls.length > 0) {
      console.log(`🖼️ 開始處理 ${imageUrls.length} 張圖片（傳統模式）...`);
      processedImages = await processStickerSet(imageUrls);
    }

    await updateTaskProgress(taskId, 80, 'processing');

    // 3. 生成主圖和標籤圖（使用第一張圖片）
    let mainImageBuffer = null;
    let tabImageBuffer = null;

    if (storageProcessed.length > 0) {
      // 網格模式：從 Storage URL 獲取第一張圖片
      const firstImg = storageProcessed[0];
      const bucket = 'sticker-images';
      const { data } = supabase.storage.from(bucket).getPublicUrl(firstImg.storagePath);
      const firstImageUrl = data.publicUrl;
      console.log(`📷 使用第一張圖片生成主圖/標籤: ${firstImageUrl}`);
      mainImageBuffer = await generateMainImage(firstImageUrl);
      tabImageBuffer = await generateTabImage(firstImageUrl);
    } else if (imageUrls.length > 0) {
      // 傳統模式：從 URL 生成
      mainImageBuffer = await generateMainImage(imageUrls[0]);
      tabImageBuffer = await generateTabImage(imageUrls[0]);
    }

    await updateTaskProgress(taskId, 90, 'processing');

    // 4. 上傳圖片到 Storage 並寫入資料庫
    let uploadResults;

    if (storageProcessed.length > 0) {
      // 網格模式：圖片已上傳，只需更新資料庫和上傳主圖/標籤
      uploadResults = await uploadGridModeResults(setId, storageProcessed, mainImageBuffer, tabImageBuffer, expressions);
    } else {
      // 傳統模式：使用現有上傳邏輯
      uploadResults = await uploadImagesToStorage(setId, processedImages, mainImageBuffer, tabImageBuffer, expressions);
    }

    // 檢查上傳結果
    const uploadedCount = uploadResults.stickerRecords?.length || 0;
    if (uploadedCount === 0) {
      throw new Error('圖片上傳失敗，沒有任何貼圖被保存');
    }

    // 5. 更新貼圖組狀態
    await updateStickerSetStatus(setId, 'completed', {
      main_image_url: uploadResults.mainImageUrl,
      tab_image_url: uploadResults.tabImageUrl
    });

    // 6. ✅ 生成成功後才扣除張數
    const deductResult = await deductTokens(
      userId,
      tokenCost,
      `生成貼圖組「${stickerSet.name}」(${uploadedCount}張貼圖)`,
      setId
    );

    if (deductResult.success) {
      console.log(`💰 生成成功，已扣除 ${tokenCost} 張，剩餘 ${deductResult.balance} 張`);
    } else {
      console.error(`⚠️ 張數扣除失敗: ${deductResult.error}（但貼圖已生成）`);
      // 即使扣除失敗，貼圖也已經生成，不影響流程
    }

    // 6.1 🎁 極速上架活動回補（交易安全：只在完成後回補，且具冪等）
    // 規則：3 組各 18 張總計 54 張；活動回補 14 張，淨消耗 40 張
    // 以 set_id 作為 referenceId 進行冪等保護：同一 set_id 只回補一次
    try {
      const promotion = stickerSet.promotion ? JSON.parse(stickerSet.promotion) : null;
      if (promotion && promotion.id === 'quick_launch_v1' && promotion.refundTokens) {
        const refundTokens = Number(promotion.refundTokens) || 0;
        const groupKey = promotion.groupKey || null;

        // 只有「最後一組」才回補（符合：三組都成功才回補）
        if (refundTokens > 0 && promotion.isLast === true) {
          const referenceId = groupKey ? `quick_launch_v1:${groupKey}` : setId;

          const { data: existingRefundTx, error: existingRefundTxError } = await supabase
            .from('token_transactions')
            .select('id')
            .eq('user_id', userId)
            .eq('transaction_type', 'promotion_refund')
            .eq('reference_id', referenceId)
            .limit(1);

          if (existingRefundTxError) {
            console.error('⚠️ 檢查回補交易失敗:', existingRefundTxError.message);
          } else if (existingRefundTx && existingRefundTx.length > 0) {
            console.log(`🎁 已存在回補交易（reference_id=${referenceId}），跳過回補`);
          } else {
            const refundResult = await addTokens(
              userId,
              refundTokens,
              'promotion_refund',
              '極速上架活動回補',
              null,
              referenceId
            );

            if (refundResult.success) {
              console.log(`🎁 已回補 ${refundTokens} 張（reference_id=${referenceId}）`);
            } else {
              console.error(`⚠️ 回補失敗: ${refundResult.error}`);
            }
          }
        }
      }
    } catch (refundError) {
      console.error('⚠️ 極速上架回補處理失敗:', refundError.message);
    }

    // 7. 完成任務
    await updateTaskProgress(taskId, 100, 'completed');
    console.log(`✅ 貼圖組 ${setId} 生成完成！共 ${uploadedCount} 張貼圖`);

    return {
      success: true,
      setId,
      imageCount: uploadedCount
    };

  } catch (error) {
    console.error(`❌ 生成任務失敗 (${taskId}):`, error);

    // 標記任務失敗
    await supabase
      .from('generation_tasks')
      .update({
        status: 'failed',
        error_message: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('task_id', taskId);

    await updateStickerSetStatus(setId, 'failed');

    // ✅ 生成失敗時，不扣除張數
    console.log(`💰 生成失敗，未扣除張數`);

    throw error;
  }
}

/**
 * 上傳圖片到 Supabase Storage 並寫入 stickers 資料表
 */
async function uploadImagesToStorage(setId, processedImages, mainImageBuffer, tabImageBuffer, expressions = []) {
  const supabase = getSupabaseClient();
  const bucket = 'sticker-images';
  const uploadResults = { imageUrls: [], mainImageUrl: null, tabImageUrl: null, stickerRecords: [] };

  try {
    // 上傳主圖
    if (mainImageBuffer) {
      const mainPath = `${setId}/main.png`;
      const { error } = await supabase.storage.from(bucket).upload(mainPath, mainImageBuffer, {
        contentType: 'image/png', upsert: true
      });
      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(mainPath);
        uploadResults.mainImageUrl = data.publicUrl;
      }
    }

    // 上傳標籤圖
    if (tabImageBuffer) {
      const tabPath = `${setId}/tab.png`;
      const { error } = await supabase.storage.from(bucket).upload(tabPath, tabImageBuffer, {
        contentType: 'image/png', upsert: true
      });
      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(tabPath);
        uploadResults.tabImageUrl = data.publicUrl;
      }
    }

    // 上傳貼圖並寫入資料庫
    for (const img of processedImages) {
      if (img.status !== 'completed' || !img.buffer) continue;

      const stickerPath = `${setId}/${String(img.index).padStart(2, '0')}.png`;
      const { error } = await supabase.storage.from(bucket).upload(stickerPath, img.buffer, {
        contentType: 'image/png', upsert: true
      });

      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(stickerPath);
        const imageUrl = data.publicUrl;
        uploadResults.imageUrls.push(imageUrl);

        // 寫入 stickers 資料表
        const stickerId = uuidv4();
        const expression = expressions[img.index - 1] || `表情 ${img.index}`;

        const { error: dbError } = await supabase
          .from('stickers')
          .insert([{
            sticker_id: stickerId,
            set_id: setId,
            index_number: img.index,
            expression: expression,
            image_url: imageUrl,
            status: 'completed'
          }]);

        if (dbError) {
          console.error(`❌ 寫入貼圖記錄失敗 (${img.index}):`, dbError);
        } else {
          uploadResults.stickerRecords.push({ stickerId, index: img.index, imageUrl });
        }
      }
    }

    console.log(`📤 已上傳 ${uploadResults.imageUrls.length} 張貼圖到 Storage`);
    console.log(`📝 已寫入 ${uploadResults.stickerRecords.length} 筆貼圖記錄到資料庫`);
    return uploadResults;

  } catch (error) {
    console.error('❌ 上傳圖片失敗:', error);
    return uploadResults;
  }
}

/**
 * 🆕 處理網格模式結果（圖片已上傳，只需更新資料庫）
 */
async function uploadGridModeResults(setId, storageProcessed, mainImageBuffer, tabImageBuffer, expressions = []) {
  const supabase = getSupabaseClient();
  const bucket = 'sticker-images';
  const uploadResults = { imageUrls: [], mainImageUrl: null, tabImageUrl: null, stickerRecords: [] };

  try {
    // 上傳主圖
    if (mainImageBuffer) {
      const mainPath = `${setId}/main.png`;
      const { error } = await supabase.storage.from(bucket).upload(mainPath, mainImageBuffer, {
        contentType: 'image/png', upsert: true
      });
      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(mainPath);
        uploadResults.mainImageUrl = data.publicUrl;
      }
    }

    // 上傳標籤圖
    if (tabImageBuffer) {
      const tabPath = `${setId}/tab.png`;
      const { error } = await supabase.storage.from(bucket).upload(tabPath, tabImageBuffer, {
        contentType: 'image/png', upsert: true
      });
      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(tabPath);
        uploadResults.tabImageUrl = data.publicUrl;
      }
    }

    // 寫入資料庫（圖片已在網格模式中上傳）
    for (const img of storageProcessed) {
      if (img.status !== 'completed' || !img.storagePath) continue;

      // 取得公開 URL
      const { data } = supabase.storage.from(bucket).getPublicUrl(img.storagePath);
      const imageUrl = data.publicUrl;
      uploadResults.imageUrls.push(imageUrl);

      // 寫入 stickers 資料表
      const stickerId = uuidv4();
      const expression = img.expression || expressions[img.index - 1] || `表情 ${img.index}`;

      const { error: dbError } = await supabase
        .from('stickers')
        .insert([{
          sticker_id: stickerId,
          set_id: setId,
          index_number: img.index,
          expression: expression,
          image_url: imageUrl,
          status: 'completed'
        }]);

      if (dbError) {
        console.error(`❌ 寫入貼圖記錄失敗 (${img.index}):`, dbError);
      } else {
        uploadResults.stickerRecords.push({ stickerId, index: img.index, imageUrl });
      }
    }

    console.log(`📤 網格模式：已處理 ${uploadResults.imageUrls.length} 張貼圖`);
    console.log(`📝 已寫入 ${uploadResults.stickerRecords.length} 筆貼圖記錄到資料庫`);
    return uploadResults;

  } catch (error) {
    console.error('❌ 處理網格模式結果失敗:', error);
    return uploadResults;
  }
}

/**
 * 記錄生成結果（不再 Push 通知，由用戶自己查詢）
 */
async function logGenerationResult(userId, success, setId, errorMessage = null) {
  if (success) {
    console.log(`✅ 用戶 ${userId} 的貼圖組 ${setId} 生成完成，等待用戶查詢「我的貼圖」`);
  } else {
    console.log(`❌ 用戶 ${userId} 的貼圖組 ${setId} 生成失敗: ${errorMessage}`);
  }
  // 不發送 Push 通知，由用戶自己輸入「我的貼圖」或「查詢進度」查看
}

/**
 * Netlify Background Function Handler
 * 最多可執行 15 分鐘
 */
exports.handler = async function(event, context) {
  console.log('🔔 ====== Sticker Generator Background Worker 開始執行 ======');
  console.log('📋 Event body:', event.body ? event.body.substring(0, 200) + '...' : 'null');

  try {
    const body = JSON.parse(event.body || '{}');
    const { taskId, setId, userId } = body;

    console.log('📦 解析參數:', { taskId, setId, userId });

    if (!taskId || !setId || !userId) {
      console.error('❌ 缺少必要參數:', { taskId, setId, userId });
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing taskId, setId or userId' }) };
    }

    console.log(`🚀 開始生成任務：taskId=${taskId}, setId=${setId}, userId=${userId}`);

    // 執行生成（這可能需要幾分鐘）
    let result;

    try {
      const { data: taskRow, error: taskQueryError } = await getSupabaseClient()
        .from('generation_tasks')
        .select('task_type')
        .eq('task_id', taskId)
        .single();

      if (taskQueryError) {
        console.error('❌ 查詢任務類型失敗:', taskQueryError);
        throw taskQueryError;
      }

      console.log(`📋 任務類型：${taskRow?.task_type || '(無)'}`);

      if (taskRow && taskRow.task_type === 'quick_launch') {
        console.log('🚀 執行極速上架流程');
        result = await executeQuickLaunch(taskId, setId);
      } else {
        console.log('📝 執行預設生成流程');
        result = await executeGeneration(taskId, setId);
      }
    } catch (routeError) {
      console.error('❌ 判斷任務類型失敗，改用預設生成流程:', routeError.message);
      console.error('❌ 錯誤詳情:', routeError);
      result = await executeGeneration(taskId, setId);
    }

    // 記錄完成（不 Push 通知）
    logGenerationResult(userId, true, setId);

    console.log(`✅ Background Worker 完成：${JSON.stringify(result)}`);
    return { statusCode: 200, body: JSON.stringify(result) };

  } catch (error) {
    console.error('❌ Background Worker 執行失敗:', error.message);
    console.error('❌ 錯誤堆疊:', error.stack);

    // 記錄失敗（不 Push 通知）
    try {
      const body = JSON.parse(event.body || '{}');
      if (body.userId) {
        logGenerationResult(body.userId, false, body.setId, error.message);
      }
    } catch (e) {
      console.error('❌ 記錄失敗:', e.message);
    }

    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

// 導出 handler 和其他函數
module.exports = {
  handler: exports.handler,
  createGenerationTask,
  executeGeneration,
  uploadGridModeResults  // 新增導出
};

