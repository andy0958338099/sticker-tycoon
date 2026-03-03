/**
 * Supabase Client Module
 * 提供 Supabase 連線與操作
 */

const { createClient } = require('@supabase/supabase-js');
const { globalCache } = require('./utils/cache-manager');

// 延遲初始化 Supabase client
let supabase = null;

function getSupabaseClient() {
  if (supabase) return supabase;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Supabase 環境變數未設定：需要 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
    throw new Error('Supabase 環境變數未設定');
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabase;
}

/**
 * 檢查 reply token 是否已使用（去重機制）
 */
async function isReplyTokenUsed(replyToken) {
  try {
    const { data, error } = await getSupabaseClient()
      .from('line_events')
      .select('reply_token')
      .eq('reply_token', replyToken)
      .limit(1);
    
    if (error) throw error;
    return data && data.length > 0;
  } catch (error) {
    console.error('檢查 reply token 失敗:', error);
    return false;
  }
}

/**
 * 記錄 reply token
 */
async function recordReplyToken(replyToken) {
  try {
    const { error } = await getSupabaseClient()
      .from('line_events')
      .insert([{ reply_token: replyToken, created_at: new Date().toISOString() }]);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('記錄 reply token 失敗:', error);
    return false;
  }
}

/**
 * 取得或建立用戶（優化版：加入快取）
 */
async function getOrCreateUser(lineUserId, displayName = null, pictureUrl = null) {
  try {
    const cacheKey = globalCache.generateKey('user', lineUserId);

    // 如果沒有提供 displayName 和 pictureUrl，優先使用快取
    if (!displayName && !pictureUrl) {
      const cached = globalCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // 先查詢是否存在
    const { data: existing, error: selectError } = await getSupabaseClient()
      .from('users')
      .select('*')
      .eq('line_user_id', lineUserId)
      .limit(1);

    if (selectError) throw selectError;

    if (existing && existing.length > 0) {
      const user = existing[0];

      // 如果有新的 displayName 或 pictureUrl，非同步更新（不阻塞回應）
      if ((displayName && displayName !== user.display_name) ||
          (pictureUrl && pictureUrl !== user.picture_url)) {
        const updateData = {};
        if (displayName) updateData.display_name = displayName;
        if (pictureUrl) updateData.picture_url = pictureUrl;
        updateData.updated_at = new Date().toISOString();

        // 非同步更新，不等待結果
        getSupabaseClient()
          .from('users')
          .update(updateData)
          .eq('line_user_id', lineUserId)
          .then(() => {
            // 更新快取
            const updatedUser = { ...user, ...updateData };
            globalCache.set(cacheKey, updatedUser, 600000); // 快取 10 分鐘
          })
          .catch(err => console.error('非同步更新用戶失敗:', err));

        // 立即返回合併後的資料
        const updatedUser = { ...user, ...updateData };
        globalCache.set(cacheKey, updatedUser, 600000);
        return updatedUser;
      }

      // 快取用戶資料
      globalCache.set(cacheKey, user, 600000); // 快取 10 分鐘
      return user;
    }

    // 生成推薦碼
    const referralCode = generateReferralCode();

    // 建立新用戶
    const { data: newUser, error: insertError } = await getSupabaseClient()
      .from('users')
      .insert([{
        line_user_id: lineUserId,
        display_name: displayName,
        picture_url: pictureUrl,
        sticker_credits: 40,  // 初始 40 張
        referral_code: referralCode
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    // 非同步記錄初始張數交易和張數帳本（不阻塞回應）
    if (newUser) {
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 天後過期

      // 記錄到 token_transactions
      recordTokenTransaction(lineUserId, 40, 40, 'initial', '新用戶贈送 40 張', null, null, expiresAt.toISOString())
        .catch(err => console.error('記錄初始張數交易失敗:', err));

      // 記錄到 token_ledger（用於有效期追蹤和 FIFO 扣款）
      getSupabaseClient()
        .from('token_ledger')
        .insert([{
          user_id: lineUserId,
          tokens: 40,
          remaining_tokens: 40,
          source_type: 'initial',
          source_order_id: null,
          source_description: '新用戶註冊贈送',
          acquired_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          is_expired: false
        }])
        .then(() => console.log(`✅ 新用戶 ${lineUserId} 的張數帳本已建立`))
        .catch(err => console.error('記錄初始張數帳本失敗:', err));

      // 快取新用戶
      globalCache.set(cacheKey, newUser, 600000);
    }

    return newUser;
  } catch (error) {
    console.error('取得/建立用戶失敗:', error);
    return null;
  }
}

/**
 * 取得用戶的貼圖組列表（優化版：加入快取）
 */
async function getUserStickerSets(userId) {
  try {
    const cacheKey = globalCache.generateKey('sticker_sets', userId);

    return await globalCache.getOrSet(
      cacheKey,
      async () => {
        const { data, error } = await getSupabaseClient()
          .from('sticker_sets')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      },
      120000 // 快取 2 分鐘
    );
  } catch (error) {
    console.error('取得貼圖組失敗:', error);
    return [];
  }
}

/**
 * 建立新的貼圖組（優化版：清除快取）
 */
async function createStickerSet(setData) {
  try {
    const { data, error } = await getSupabaseClient()
      .from('sticker_sets')
      .insert([setData])
      .select()
      .single();

    if (error) throw error;

    // 清除用戶的貼圖組列表快取
    if (data && setData.user_id) {
      const cacheKey = globalCache.generateKey('sticker_sets', setData.user_id);
      globalCache.delete(cacheKey);
    }

    return data;
  } catch (error) {
    console.error('建立貼圖組失敗:', error);
    return null;
  }
}

/**
 * 更新貼圖組狀態（優化版：清除相關快取）
 */
async function updateStickerSetStatus(setId, status, additionalData = {}) {
  try {
    const { error } = await getSupabaseClient()
      .from('sticker_sets')
      .update({ status, ...additionalData, updated_at: new Date().toISOString() })
      .eq('set_id', setId);

    if (error) throw error;

    // 清除相關快取
    globalCache.deleteByPrefix('sticker_sets:');
    globalCache.deleteByPrefix('sticker_set:');

    return true;
  } catch (error) {
    console.error('更新貼圖組狀態失敗:', error);
    return false;
  }
}

/**
 * 取得貼圖組詳情（優化版：加入快取，支援 set_id 或 id 查詢）
 */
async function getStickerSet(setId) {
  try {
    const cacheKey = globalCache.generateKey('sticker_set', setId);

    return await globalCache.getOrSet(
      cacheKey,
      async () => {
        // 先嘗試用 set_id 查詢
        let { data, error } = await getSupabaseClient()
          .from('sticker_sets')
          .select('*')
          .eq('set_id', setId)
          .single();

        // 如果找不到，再嘗試用 id 查詢
        if (error || !data) {
          const result = await getSupabaseClient()
            .from('sticker_sets')
            .select('*')
            .eq('id', setId)
            .single();

          data = result.data;
          error = result.error;
        }

        if (error) throw error;
        return data;
      },
      180000 // 快取 3 分鐘
    );
  } catch (error) {
    console.error('取得貼圖組詳情失敗:', error);
    return null;
  }
}

/**
 * 取得貼圖組的所有貼圖圖片
 * 如果 stickers 資料表沒有資料，會嘗試從 Storage 掃描並補寫
 */
async function getStickerImages(setId) {
  try {
    const supabase = getSupabaseClient();

    // 先從資料庫查詢
    const { data, error } = await supabase
      .from('stickers')
      .select('sticker_id, index_number, expression, image_url, status')
      .eq('set_id', setId)
      .order('index_number', { ascending: true });

    if (error) throw error;

    // 如果有資料，直接返回
    if (data && data.length > 0) {
      return data;
    }

    // 沒有資料，嘗試從 Storage 掃描
    console.log(`📂 stickers 資料表沒有記錄，嘗試從 Storage 掃描: ${setId}`);
    const scannedStickers = await scanAndCreateStickerRecords(setId);
    return scannedStickers;

  } catch (error) {
    console.error('取得貼圖圖片失敗:', error);
    return [];
  }
}

/**
 * 從 Storage 掃描貼圖並補寫到資料庫
 */
async function scanAndCreateStickerRecords(setId) {
  const supabase = getSupabaseClient();
  const bucket = 'sticker-images';
  const stickers = [];

  try {
    // 列出此 setId 資料夾下的所有檔案
    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list(setId, { limit: 50 });

    if (error || !files) {
      console.error('掃描 Storage 失敗:', error);
      return [];
    }

    // 篩選出貼圖檔案（接受所有 PNG 檔案，不限制檔案名稱格式）
    const stickerFiles = files.filter(f => {
      // 排除資料夾（資料夾沒有副檔名）
      if (f.id && !f.name.includes('.')) return false;
      // 只接受 PNG 檔案
      return f.name.toLowerCase().endsWith('.png');
    });
    stickerFiles.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`🔍 找到 ${stickerFiles.length} 個貼圖檔案`, stickerFiles.map(f => f.name));

    // 為每個檔案建立記錄
    const { v4: uuidv4 } = require('uuid');

    for (let i = 0; i < stickerFiles.length; i++) {
      const file = stickerFiles[i];
      const indexMatch = file.name.match(/(\d+)\.png/);
      const indexNumber = indexMatch ? parseInt(indexMatch[1]) : i + 1;

      // 取得公開 URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(`${setId}/${file.name}`);

      const stickerId = uuidv4();
      const stickerRecord = {
        sticker_id: stickerId,
        set_id: setId,
        index_number: indexNumber,
        expression: `表情 ${indexNumber}`,
        image_url: urlData.publicUrl,
        status: 'completed'
      };

      // 寫入資料庫
      const { error: insertError } = await supabase
        .from('stickers')
        .insert([stickerRecord]);

      if (insertError) {
        console.error(`❌ 補寫貼圖記錄失敗 (${indexNumber}):`, insertError);
      } else {
        stickers.push(stickerRecord);
      }
    }

    console.log(`✅ 已補寫 ${stickers.length} 筆貼圖記錄`);
    return stickers;

  } catch (error) {
    console.error('掃描並補寫貼圖記錄失敗:', error);
    return [];
  }
}

/**
 * 刪除貼圖組
 */
async function deleteStickerSet(setId, userId) {
  try {
    // 先確認是用戶自己的貼圖組
    const set = await getStickerSet(setId);
    if (!set) {
      return { success: false, error: '找不到此貼圖組' };
    }
    if (set.user_id !== userId) {
      return { success: false, error: '沒有權限刪除此貼圖組' };
    }

    // 取得實際的 set_id（UUID）和 id（整數）
    const actualSetId = set.set_id;
    const actualId = set.id;

    // 刪除相關的生成任務（使用 set_id）
    if (actualSetId) {
      await getSupabaseClient()
        .from('generation_tasks')
        .delete()
        .eq('sticker_set_id', actualSetId);
    }

    // 刪除貼圖組（使用整數 id）
    const { error } = await getSupabaseClient()
      .from('sticker_sets')
      .delete()
      .eq('id', actualId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('刪除貼圖組失敗:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 取得用戶最新的生成任務（含貼圖組資訊）
 * 🚀 優化：使用 JOIN 一次查詢，避免 N+1 問題
 */
async function getUserLatestTask(userId) {
  try {
    const supabase = getSupabaseClient();

    // 🚀 優化：使用 JOIN 一次查詢任務和貼圖組
    const { data: tasks, error } = await supabase
      .from('generation_tasks')
      .select(`
        task_id,
        set_id,
        status,
        progress,
        created_at,
        sticker_sets:set_id (
          set_id,
          name,
          status,
          sticker_count
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      if (error.code === 'PGRST116') return null; // 沒有記錄
      throw error;
    }

    if (!tasks || tasks.length === 0) return null;

    const task = tasks[0];

    // 將 sticker_sets 陣列轉為單一物件（因為是 1:1 關係）
    if (task.sticker_sets && Array.isArray(task.sticker_sets)) {
      task.sticker_set = task.sticker_sets[0];
      delete task.sticker_sets;
    }

    return task;
  } catch (error) {
    console.error('取得最新任務失敗:', error);
    return null;
  }
}

/**
 * 取得用戶所有進行中的任務
 * 🆕 增加超時檢查：超過 15 分鐘的任務自動標記為失敗
 */
async function getUserPendingTasks(userId) {
  try {
    const supabase = getSupabaseClient();

    // 查詢進行中的任務
    const { data: tasks, error } = await supabase
      .from('generation_tasks')
      .select('task_id, set_id, status, progress, created_at')
      .eq('user_id', userId)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!tasks || tasks.length === 0) return [];

    // 🆕 檢查超時任務（超過 15 分鐘）
    const TIMEOUT_MINUTES = 15;
    const now = new Date();
    const validTasks = [];

    for (const task of tasks) {
      const createdAt = new Date(task.created_at);
      const diffMinutes = (now - createdAt) / 1000 / 60;

      if (diffMinutes > TIMEOUT_MINUTES) {
        // 超時了，標記為失敗
        console.log(`⏰ 任務 ${task.task_id} 超時 (${Math.round(diffMinutes)} 分鐘)，自動標記為失敗`);
        await supabase
          .from('generation_tasks')
          .update({
            status: 'failed',
            error_message: `任務超時（超過 ${TIMEOUT_MINUTES} 分鐘）`,
            updated_at: new Date().toISOString()
          })
          .eq('task_id', task.task_id);

        // 同時更新貼圖組狀態
        if (task.set_id) {
          await supabase
            .from('sticker_sets')
            .update({ status: 'failed' })
            .eq('set_id', task.set_id);
        }
      } else {
        validTasks.push(task);
      }
    }

    if (validTasks.length === 0) return [];

    // 查詢對應的貼圖組
    const setIds = validTasks.map(t => t.set_id).filter(Boolean);
    if (setIds.length > 0) {
      const { data: stickerSets } = await supabase
        .from('sticker_sets')
        .select('set_id, name, status')
        .in('set_id', setIds);

      // 合併資料
      const setMap = {};
      (stickerSets || []).forEach(s => setMap[s.set_id] = s);
      validTasks.forEach(t => t.sticker_set = setMap[t.set_id] || null);
    }

    return validTasks;
  } catch (error) {
    console.error('取得進行中任務失敗:', error);
    return [];
  }
}

// ============================================
// 上傳佇列相關函數
// ============================================

/**
 * 新增貼圖到上傳佇列
 */
async function addToUploadQueue(userId, stickerId, sourceSetId, imageUrl, expression) {
  try {
    const supabase = getSupabaseClient();

    // 先檢查佇列中已有多少張
    const { count } = await supabase
      .from('upload_queue')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (count >= 40) {
      return { success: false, error: '待上傳佇列已滿（最多 40 張）' };
    }

    // 新增到佇列
    const { data, error } = await supabase
      .from('upload_queue')
      .insert([{
        user_id: userId,
        sticker_id: stickerId,
        source_set_id: sourceSetId,
        image_url: imageUrl,
        expression: expression,
        queue_order: (count || 0) + 1
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {  // unique violation
        return { success: false, error: '此貼圖已在待上傳佇列中' };
      }
      throw error;
    }

    return { success: true, data, currentCount: (count || 0) + 1 };
  } catch (error) {
    console.error('新增到上傳佇列失敗:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 從上傳佇列移除貼圖
 */
async function removeFromUploadQueue(userId, stickerId) {
  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('upload_queue')
      .delete()
      .eq('user_id', userId)
      .eq('sticker_id', stickerId);

    if (error) throw error;

    // 重新排序
    await reorderUploadQueue(userId);

    return { success: true };
  } catch (error) {
    console.error('從上傳佇列移除失敗:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 重新排序上傳佇列
 * 優化版：使用批次更新取代逐一更新，減少 DB 操作次數
 */
async function reorderUploadQueue(userId) {
  try {
    const supabase = getSupabaseClient();

    // 取得所有佇列項目
    const { data: items, error: selectError } = await supabase
      .from('upload_queue')
      .select('id')
      .eq('user_id', userId)
      .order('queue_order', { ascending: true });

    if (selectError || !items || items.length === 0) {
      return;
    }

    // 使用 Promise.all 進行並行更新（批次處理）
    // 注意：對於大量資料，可考慮使用 Supabase RPC 或分批處理
    const updatePromises = items.map((item, index) =>
      supabase
        .from('upload_queue')
        .update({ queue_order: index + 1 })
        .eq('id', item.id)
    );

    // 並行執行所有更新
    await Promise.all(updatePromises);

    console.log(`✅ 佇列重新排序完成：${items.length} 項目`);
  } catch (error) {
    console.error('重新排序失敗:', error);
  }
}

/**
 * 取得用戶的上傳佇列
 */
async function getUploadQueue(userId) {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('upload_queue')
      .select('*')
      .eq('user_id', userId)
      .order('queue_order', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('取得上傳佇列失敗:', error);
    return [];
  }
}

/**
 * 清空用戶的上傳佇列
 */
async function clearUploadQueue(userId) {
  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('upload_queue')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('清空上傳佇列失敗:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 檢查貼圖是否在上傳佇列中
 */
async function isInUploadQueue(userId, stickerId) {
  try {
    const supabase = getSupabaseClient();

    const { data } = await supabase
      .from('upload_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('sticker_id', stickerId)
      .single();

    return !!data;
  } catch (error) {
    return false;
  }
}

/**
 * 記錄張數交易
 */
async function recordTokenTransaction(userId, amount, balanceAfter, type, description, referenceId = null, adminNote = null, expiresAt = null) {
  try {
    const transactionData = {
      user_id: userId,
      amount,
      balance_after: balanceAfter,
      transaction_type: type,
      description,
      reference_id: referenceId,
      admin_note: adminNote
    };

    // 如果有提供 expiresAt，加入記錄
    if (expiresAt) {
      transactionData.expires_at = expiresAt;
    }

    const { error } = await getSupabaseClient()
      .from('token_transactions')
      .insert([transactionData]);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('記錄張數交易失敗:', error);
    return false;
  }
}

/**
 * 取得用戶張數餘額（強制即時查詢資料庫，不使用快取）
 */
async function getUserTokenBalance(lineUserId) {
  try {
    const { data, error } = await getSupabaseClient()
      .from('users')
      .select('sticker_credits')
      .eq('line_user_id', lineUserId)
      .single();

    if (error) throw error;
    return data?.sticker_credits || 0;
  } catch (error) {
    console.error('取得張數餘額失敗:', error);
    return 0;
  }
}

/**
 * 檢查並扣除張數（FIFO：優先扣除最早到期的張數）
 * @param {string} lineUserId - LINE 用戶 ID
 * @param {number} amount - 要扣除的數量
 * @param {string} description - 描述
 * @param {string} referenceId - 關聯 ID（如貼圖組 ID）
 * @returns {object} { success: boolean, balance: number, error?: string }
 */
async function deductTokens(lineUserId, amount, description, referenceId = null) {
  try {
    const supabase = getSupabaseClient();

    // 1. 查詢所有可用張數（未過期且有剩餘），按到期時間排序（FIFO）
    const { data: availableLedgers, error: ledgerError } = await supabase
      .from('token_ledger')
      .select('*')
      .eq('user_id', lineUserId)
      .gt('remaining_tokens', 0)
      .eq('is_expired', false)
      .order('expires_at', { ascending: true });  // 最早到期的優先

    if (ledgerError) throw ledgerError;

    // 計算總可用張數
    const totalAvailable = availableLedgers?.reduce(
      (sum, l) => sum + l.remaining_tokens, 0
    ) || 0;

    // 檢查是否足夠
    if (totalAvailable < amount) {
      return {
        success: false,
        balance: totalAvailable,
        error: `張數不足！目前餘額 ${totalAvailable}，需要 ${amount} 張`
      };
    }

    // 2. 從最早到期的張數開始扣除（FIFO）
    let remaining = amount;
    const updates = [];

    for (const ledger of availableLedgers) {
      if (remaining <= 0) break;

      const deduct = Math.min(ledger.remaining_tokens, remaining);
      const newRemaining = ledger.remaining_tokens - deduct;

      updates.push({
        id: ledger.id,
        remaining_tokens: newRemaining
      });

      remaining -= deduct;
    }

    // 3. 批次更新張數帳本
    for (const update of updates) {
      await supabase
        .from('token_ledger')
        .update({
          remaining_tokens: update.remaining_tokens,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.id);
    }

    // 4. 更新用戶總餘額
    const newBalance = totalAvailable - amount;
    const { error: updateError } = await supabase
      .from('users')
      .update({ sticker_credits: newBalance, updated_at: new Date().toISOString() })
      .eq('line_user_id', lineUserId);

    if (updateError) throw updateError;

    // 5. 更新快取（確保快取與資料庫同步）
    const cacheKey = globalCache.generateKey('user', lineUserId);
    const cachedUser = globalCache.get(cacheKey);
    if (cachedUser) {
      // 更新現有快取
      cachedUser.sticker_credits = newBalance;
      globalCache.set(cacheKey, cachedUser, 600000);
    } else {
      // 建立新快取（確保下次查詢時使用正確值）
      globalCache.set(cacheKey, { line_user_id: lineUserId, sticker_credits: newBalance }, 600000);
    }

    // 6. 非同步記錄交易（不阻塞回應）
    recordTokenTransaction(lineUserId, -amount, newBalance, 'generate', description, referenceId)
      .catch(err => console.error('記錄張數交易失敗:', err));

    return { success: true, balance: newBalance };
  } catch (error) {
    console.error('扣除張數失敗:', error);
    return { success: false, balance: 0, error: error.message };
  }
}

/**
 * 增加張數（含有效期追蹤，購買/管理員調整用）
 */
async function addTokens(lineUserId, amount, type, description, adminNote = null, referenceId = null) {
  try {
    const supabase = getSupabaseClient();

    // 取得當前餘額
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('sticker_credits')
      .eq('line_user_id', lineUserId)
      .single();

    if (userError) throw userError;

    const currentBalance = user?.sticker_credits || 0;
    const newBalance = currentBalance + amount;

    // 增加張數
    const { error: updateError } = await supabase
      .from('users')
      .update({ sticker_credits: newBalance, updated_at: new Date().toISOString() })
      .eq('line_user_id', lineUserId);

    if (updateError) throw updateError;

    // 計算到期時間（30 天後）
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30);

    // 同步更新 token_ledger（用於有效期追蹤和 FIFO 扣款）
    await supabase
      .from('token_ledger')
      .insert([{
        user_id: lineUserId,
        tokens: amount,
        remaining_tokens: amount,
        source_type: type,
        source_order_id: null,
        source_description: description,
        acquired_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        is_expired: false
      }]);

    // 更新快取（確保快取與資料庫同步）
    const cacheKey = globalCache.generateKey('user', lineUserId);
    const cachedUser = globalCache.get(cacheKey);
    if (cachedUser) {
      // 更新現有快取
      cachedUser.sticker_credits = newBalance;
      globalCache.set(cacheKey, cachedUser, 600000);
    } else {
      // 建立新快取（確保下次查詢時使用正確值）
      globalCache.set(cacheKey, { line_user_id: lineUserId, sticker_credits: newBalance }, 600000);
    }

    // 非同步記錄交易（不阻塞回應）
    recordTokenTransaction(lineUserId, amount, newBalance, type, description, referenceId, adminNote, expiresAt.toISOString())
      .catch(err => console.error('記錄張數交易失敗:', err));

    return { success: true, balance: newBalance };
  } catch (error) {
    console.error('增加張數失敗:', error);
    return { success: false, balance: 0, error: error.message };
  }
}

/**
 * 取得用戶張數交易記錄
 */
async function getTokenTransactions(lineUserId, limit = 20) {
  try {
    const { data, error } = await getSupabaseClient()
      .from('token_transactions')
      .select('*')
      .eq('user_id', lineUserId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('取得張數交易記錄失敗:', error);
    return [];
  }
}

// ============================================
// 推薦系統
// ============================================

/**
 * 生成 6 位推薦碼
 */
function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // 排除容易混淆的字符
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 根據推薦碼取得用戶
 */
async function getUserByReferralCode(referralCode) {
  try {
    const { data, error } = await getSupabaseClient()
      .from('users')
      .select('*')
      .eq('referral_code', referralCode.toUpperCase())
      .limit(1);

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('查詢推薦碼失敗:', error);
    return null;
  }
}

/**
 * 取得用戶的推薦資訊（優化版：加入快取）
 */
async function getUserReferralInfo(lineUserId) {
  try {
    const cacheKey = globalCache.generateKey('referral_info', lineUserId);

    return await globalCache.getOrSet(
      cacheKey,
      async () => {
        const { data: user, error } = await getSupabaseClient()
          .from('users')
          .select('referral_code, referral_count, referred_by')
          .eq('line_user_id', lineUserId)
          .single();

        if (error) throw error;

        // 查詢推薦成功記錄
        const { data: referrals } = await getSupabaseClient()
          .from('referrals')
          .select('referee_id, created_at')
          .eq('referrer_id', lineUserId)
          .order('created_at', { ascending: false });

        return {
          referralCode: user?.referral_code,
          referralCount: user?.referral_count || 0,
          referredBy: user?.referred_by,
          referrals: referrals || []
        };
      },
      300000 // 快取 5 分鐘
    );
  } catch (error) {
    console.error('取得推薦資訊失敗:', error);
    return { referralCode: null, referralCount: 0, referredBy: null, referrals: [] };
  }
}

/**
 * 使用推薦碼（綁定推薦關係並發放獎勵）
 */
async function applyReferralCode(refereeUserId, referralCode) {
  try {
    // 1. 查詢被推薦者資料
    const { data: referee, error: refereeError } = await getSupabaseClient()
      .from('users')
      .select('*')
      .eq('line_user_id', refereeUserId)
      .single();

    if (refereeError || !referee) {
      return { success: false, error: '找不到用戶資料' };
    }

    // 2. 檢查是否已經被推薦過
    if (referee.referred_by) {
      return { success: false, error: '你已經使用過推薦碼了' };
    }

    // 3. 查詢推薦人
    const referrer = await getUserByReferralCode(referralCode);
    if (!referrer) {
      return { success: false, error: '推薦碼無效，請確認後重試' };
    }

    // 4. 檢查是否推薦自己
    if (referrer.line_user_id === refereeUserId) {
      return { success: false, error: '不能使用自己的推薦碼' };
    }

    // 5. 檢查推薦人是否已達上限（30次）
    if (referrer.referral_count >= 30) {
      return { success: false, error: '此推薦碼已達使用上限' };
    }

    // 6. 開始發放獎勵
    const REFERRAL_TOKENS = 30;

    // 6.1 更新被推薦者（使用 addTokens 統一處理，含 token_ledger）
    await addTokens(
      refereeUserId,
      REFERRAL_TOKENS,
      'referral_bonus',
      `使用推薦碼 ${referralCode} 獲得獎勵`
    );

    // 同時更新 referred_by 欄位
    await getSupabaseClient()
      .from('users')
      .update({
        referred_by: referrer.line_user_id,
        updated_at: new Date().toISOString()
      })
      .eq('line_user_id', refereeUserId);

    // 6.2 更新推薦人（使用 addTokens 統一處理，含 token_ledger）
    const newReferralCount = (referrer.referral_count || 0) + 1;

    await addTokens(
      referrer.line_user_id,
      REFERRAL_TOKENS,
      'referral_bonus',
      `好友使用推薦碼加入獲得獎勵`
    );

    // 同時更新推薦次數
    await getSupabaseClient()
      .from('users')
      .update({
        referral_count: newReferralCount,
        updated_at: new Date().toISOString()
      })
      .eq('line_user_id', referrer.line_user_id);

    // 6.3 記錄推薦關係
    await getSupabaseClient()
      .from('referrals')
      .insert([{
        referrer_id: referrer.line_user_id,
        referee_id: refereeUserId,
        referrer_tokens: REFERRAL_TOKENS,
        referee_tokens: REFERRAL_TOKENS
      }]);

    return {
      success: true,
      referrerName: referrer.display_name || '好友',
      tokensAwarded: REFERRAL_TOKENS,
      newBalance: newRefereeBalance,
      referrerNewCount: newReferralCount
    };
  } catch (error) {
    console.error('使用推薦碼失敗:', error);
    return { success: false, error: '系統錯誤，請稍後再試' };
  }
}

module.exports = {
  // 使用 getter 導出 supabase 實例，避免初始化時錯誤
  get supabase() { return getSupabaseClient(); },
  getSupabaseClient,
  isReplyTokenUsed,
  recordReplyToken,
  getOrCreateUser,
  getUserStickerSets,
  createStickerSet,
  updateStickerSetStatus,
  getStickerSet,
  getStickerImages,
  deleteStickerSet,
  getUserLatestTask,
  getUserPendingTasks,
  // 上傳佇列
  addToUploadQueue,
  removeFromUploadQueue,
  getUploadQueue,
  clearUploadQueue,
  isInUploadQueue,
  // 張數系統
  recordTokenTransaction,
  getUserTokenBalance,
  deductTokens,
  addTokens,
  getTokenTransactions,
  // 推薦系統
  generateReferralCode,
  getUserByReferralCode,
  applyReferralCode,
  getUserReferralInfo
};

