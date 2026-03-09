const { supabase } = require('./supabaseClient');

const PLAN_CONFIG = {
  20: { amount: 20, tokens: 10, name: '小額體驗 10 張' },
  300: { amount: 300, tokens: 140, name: '入門方案 140 張' },
  500: { amount: 500, tokens: 260, name: '最熱門 260 張' }
};

function getPlanConfig(plan) {
  return PLAN_CONFIG[plan];
}

async function createOrder({ userId, plan, amount, tokens, orderId }) {
  const { data, error } = await supabase
    .from('token_orders')
    .insert({
      user_id: userId,
      plan,
      amount,
      tokens,
      order_id: orderId,
      status: 'pending'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function attachTransactionId(orderId, transactionId) {
  const { error } = await supabase
    .from('token_orders')
    .update({ line_pay_transaction_id: transactionId })
    .eq('order_id', orderId);
  if (error) throw error;
}

async function getOrderByOrderId(orderId) {
  const { data, error } = await supabase
    .from('token_orders')
    .select('*')
    .eq('order_id', orderId)
    .single();
  if (error) throw error;
  return data;
}

// 只允許 pending -> paid 一次
async function markOrderPaidOnce(orderId) {
  const { data, error } = await supabase
    .from('token_orders')
    .update({ status: 'paid', line_pay_status: 'success', updated_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('status', 'pending')
    .select()
    .single();

  if (!error && data) return { updated: true, order: data };

  // 沒更新到，代表可能已 paid
  const current = await getOrderByOrderId(orderId);
  if (current.status === 'paid') return { updated: false, order: current };

  // 其他錯誤
  if (error) throw error;
  return { updated: false, order: current };
}

async function completeOrderAndAddTokens(orderId) {
  const order = await getOrderByOrderId(orderId);

  const markRes = await markOrderPaidOnce(orderId);
  if (!markRes.updated) {
    // 已處理過，不重複入帳
    return { order: markRes.order, user_balance: await getUserBalance(order.user_id), alreadyProcessed: true };
  }

  const lineUserId = order.user_id;
  const amountTokens = order.tokens;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('sticker_credits')
    .eq('line_user_id', lineUserId)
    .single();
  if (userError) throw userError;

  const currentBalance = user?.sticker_credits || 0;
  const newBalance = currentBalance + amountTokens;

  const { error: updateUserError } = await supabase
    .from('users')
    .update({ sticker_credits: newBalance, updated_at: new Date().toISOString() })
    .eq('line_user_id', lineUserId);
  if (updateUserError) throw updateUserError;

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);

  await supabase.from('token_ledger').insert([{
    user_id: lineUserId,
    tokens: amountTokens,
    remaining_tokens: amountTokens,
    source_type: 'line_pay',
    source_order_id: order.order_id,
    source_description: `LINE Pay 付款 NT$${order.amount}，獲得 ${amountTokens} 張`,
    acquired_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    is_expired: false
  }]);

  await supabase.from('token_transactions').insert([{
    user_id: lineUserId,
    change: amountTokens,
    balance_after: newBalance,
    type: 'line_pay',
    description: `LINE Pay 付款 NT$${order.amount}，獲得 ${amountTokens} 張`,
    reference_id: order.order_id,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  }]);

  return { order: markRes.order, user_balance: newBalance, alreadyProcessed: false };
}

async function getUserBalance(lineUserId) {
  const { data, error } = await supabase
    .from('users')
    .select('sticker_credits')
    .eq('line_user_id', lineUserId)
    .single();
  if (error) throw error;
  return data?.sticker_credits || 0;
}

module.exports = {
  getPlanConfig,
  createOrder,
  attachTransactionId,
  getOrderByOrderId,
  completeOrderAndAddTokens
};
