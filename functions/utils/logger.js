/**
 * 統一的日誌工具
 * 提供結構化、有顏色的日誌輸出
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// ⚠️ 這裡必須用 ?? 而不是 ||
//
// LOG_LEVELS.DEBUG = 0，而 0 是 falsy —— 用 `||` 會讓 DEBUG 等級永遠被
// 判成「沒設定」而落到 INFO，導致 logDebug() 永遠不輸出。
// DEBUG 是合法且有用的等級（開發時開 LOG_LEVEL=debug 應生效），所以用 ??。
const CURRENT_LOG_LEVEL =
  LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;


/**
 * 格式化日誌訊息
 * @param {string} level - 日誌等級
 * @param {string} message - 訊息
 * @param {Object} meta - 額外資訊
 */
function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

/**
 * Debug 等級日誌
 */
function debug(message, meta) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
    console.log(`🔍 ${formatLog('DEBUG', message, meta)}`);
  }
}

/**
 * Info 等級日誌
 */
function info(message, meta) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
    console.log(`ℹ️ ${formatLog('INFO', message, meta)}`);
  }
}

/**
 * Warn 等級日誌
 */
function warn(message, meta) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
    console.warn(`⚠️ ${formatLog('WARN', message, meta)}`);
  }
}

/**
 * Error 等級日誌
 */
function error(message, meta) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
    console.error(`❌ ${formatLog('ERROR', message, meta)}`);
  }
}

/**
 * Success 日誌（總是顯示）
 */
function success(message, meta) {
  console.log(`✅ ${formatLog('SUCCESS', message, meta)}`);
}

/**
 * 記錄函數執行時間
 */
function logExecutionTime(funcName, startTime) {
  const duration = Date.now() - startTime;
  info(`${funcName} 執行完成`, { duration: `${duration}ms` });
}

/**
 * 創建帶有 userId 的日誌器
 */
function createUserLogger(userId) {
  return {
    debug: (msg, meta) => debug(msg, { userId, ...meta }),
    info: (msg, meta) => info(msg, { userId, ...meta }),
    warn: (msg, meta) => warn(msg, { userId, ...meta }),
    error: (msg, meta) => error(msg, { userId, ...meta }),
    success: (msg, meta) => success(msg, { userId, ...meta }),
  };
}

/**
 * 相容 API（早期版本的名稱）
 *
 * 舊版模組提供 `log` / `logError` / `logInfo` / `logWarn` / `logDebug` / `logSuccess`，
 * 重構後改名為 `info` / `error` / `warn` / `debug` / `success`。
 * 既有測試與部分呼叫端仍用舊名稱 → 保留別名，兩套都能用。
 *
 * 舊的 `log()` 接受多個參數並把 Error 物件轉成訊息；
 * 新的 `info(message, meta)` 只收兩個參數 → 這層別名做轉換。
 */

/** 舊 log() 的多參數／Error 物件相容處理 */
function log(...args) {
  const [message, meta] = normalizeArgs(args);
  info(message, meta);
}

/** 把 Error 物件轉成可讀訊息，其餘參數併入 meta */
function normalizeArgs(args) {
  const [first, ...rest] = args;

  if (first instanceof Error) {
    return [first.message, { error: first.message, stack: first.stack, ...rest[0] }];
  }
  if (rest.length === 0) {
    return [first, {}];
  }
  if (rest.length === 1 && rest[0] && typeof rest[0] === 'object' && !(rest[0] instanceof Error)) {
    return [first, rest[0]];
  }
  // 多個純值參數 → 併成 meta.args
  return [first, { args: rest }];
}

const logError = (...args) => {
  const [message, meta] = normalizeArgs(args);
  error(message, meta);
};
const logInfo = (...args) => {
  const [message, meta] = normalizeArgs(args);
  info(message, meta);
};
const logWarn = (...args) => {
  const [message, meta] = normalizeArgs(args);
  warn(message, meta);
};
const logDebug = (...args) => {
  const [message, meta] = normalizeArgs(args);
  debug(message, meta);
};
const logSuccess = (...args) => {
  const [message, meta] = normalizeArgs(args);
  success(message, meta);
};

module.exports = {
  debug,
  info,
  warn,
  error,
  success,
  logExecutionTime,
  createUserLogger,
  LOG_LEVELS,
  // 相容別名
  log,
  logError,
  logInfo,
  logWarn,
  logDebug,
  logSuccess,
};

