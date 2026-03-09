#!/usr/bin/env bash
set -euo pipefail

# ===== 使用方式 =====
# 1) 準備本機後端程式碼目錄（預設）：deploy/line-pay-reset/line-pay-service
# 2) 把真實環境變數放在：deploy/line-pay-reset/.env.production
# 3) export SERVER_HOST=43.134.176.45
# 4) export SERVER_USER=root
# 5) (可選) export SSH_PORT=22
# 6) 執行: bash deploy/line-pay-reset/deploy.sh

SERVER_HOST="${SERVER_HOST:-43.134.176.45}"
SERVER_USER="${SERVER_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_DIR="/root/line-pay-service"

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LINE_PAY_LOCAL_DIR="${LINE_PAY_LOCAL_DIR:-$PROJECT_ROOT/deploy/line-pay-reset/line-pay-service}"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/deploy/line-pay-reset/.env.production}"

echo "[1/6] 檢查必要檔案..."
test -f "$LINE_PAY_LOCAL_DIR/package.json"
test -f "$LINE_PAY_LOCAL_DIR/src/app.js"
test -f "$PROJECT_ROOT/deploy/line-pay-reset/ecosystem.config.js"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 找不到環境檔：$ENV_FILE"
  echo "請先建立 deploy/line-pay-reset/.env.production（可參考 .env.example）"
  exit 1
fi

echo "[2/6] 上傳程式到騰訊雲..."
rsync -az --delete \
  -e "ssh -p $SSH_PORT" \
  --exclude "node_modules" \
  --exclude ".git" \
  "$LINE_PAY_LOCAL_DIR/src/" "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/src/"

rsync -az \
  -e "ssh -p $SSH_PORT" \
  "$LINE_PAY_LOCAL_DIR/package.json" \
  "$LINE_PAY_LOCAL_DIR/package-lock.json" \
  "$PROJECT_ROOT/deploy/line-pay-reset/ecosystem.config.js" \
  "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/"

echo "[3/6] 上傳 .env 到騰訊雲..."
scp -P "$SSH_PORT" "$ENV_FILE" "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/.env"

echo "[4/6] 在騰訊雲安裝依賴..."
ssh -p "$SSH_PORT" "$SERVER_USER@$SERVER_HOST" "cd $REMOTE_DIR && npm install --production"

echo "[5/6] 重啟 PM2..."
ssh -p "$SSH_PORT" "$SERVER_USER@$SERVER_HOST" "cd $REMOTE_DIR && pm2 delete line-pay >/dev/null 2>&1 || true && pm2 start ecosystem.config.js && pm2 save"

echo "[6/6] 驗證服務健康狀態..."
ssh -p "$SSH_PORT" "$SERVER_USER@$SERVER_HOST" "curl -s http://127.0.0.1:3000/health"

echo "✅ 部署完成"
