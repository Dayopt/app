#!/bin/bash

# ========================================
# Dayopt - magic link 生成スクリプト
# ========================================
# Supabase Auth Admin API で email login の magic link を発行する。
# captcha protection / UI form の bug を bypass して直接 login できる。
#
# 用途: dogfooding 用。captcha が enabled で curl 経由 login ができない時、
# UI form 側に bug がある時に。生成された URL をブラウザで開けば login 完了。
#
# 使い方:
#   op run --env-file=.op-env.local -- \
#     env USER_EMAIL=foo@example.com \
#     bash scripts/admin-generate-magiclink.sh
# ========================================

set -euo pipefail

USER_EMAIL="${USER_EMAIL:-}"
APP_BASE_URL="${APP_BASE_URL:-https://app-dayopt.vercel.app}"
NEXT_PATH="${NEXT_PATH:-/calendar/day}"

if [[ -z "$USER_EMAIL" ]]; then
  echo "エラー: USER_EMAIL を指定してください" >&2
  exit 1
fi

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "エラー: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です" >&2
  exit 1
fi

AUTH_HEADERS=(
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Content-Type: application/json"
)

echo "[Supabase] ${USER_EMAIL} の magic link を生成中..."

# /auth/confirm route が verifyOtp({ token_hash, type }) を呼ぶ形なので、
# Supabase の verify endpoint は経由せず token_hash を直接 app の confirm route に渡す。
# これで redirect_to allowlist の問題を bypass できる。
REQUEST_BODY=$(jq -n \
  --arg email "$USER_EMAIL" \
  '{type: "magiclink", email: $email}')

HTTP_STATUS=$(curl -sS -o /tmp/admin-generate-magiclink-response.json -w "%{http_code}" \
  -X POST \
  "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link" \
  "${AUTH_HEADERS[@]}" \
  -d "$REQUEST_BODY")

if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
  HASHED_TOKEN=$(jq -r '.hashed_token // .properties.hashed_token // empty' /tmp/admin-generate-magiclink-response.json)
  if [[ -z "$HASHED_TOKEN" ]]; then
    echo "エラー: hashed_token が response に含まれていません" >&2
    cat /tmp/admin-generate-magiclink-response.json >&2
    exit 1
  fi

  # app の /auth/confirm route が verifyOtp({ token_hash, type }) で session を確立する。
  # next param で login 後の遷移先を指定。
  CONFIRM_URL="${APP_BASE_URL}/ja/auth/confirm?token_hash=${HASHED_TOKEN}&type=magiclink&next=${NEXT_PATH}"

  # op run の stdout masking を回避するため、URL を表示せず open(1) で直接ブラウザ起動。
  echo ""
  echo "=== 完了 ==="
  echo ""
  echo "ブラウザで /auth/confirm を開きます..."
  echo "→ ${APP_BASE_URL}/ja/auth/confirm?token_hash=...&type=magiclink&next=${NEXT_PATH}"
  open "$CONFIRM_URL"
  echo ""
  echo "※ token は短命 (デフォルト 1 時間)、single-use です"
  echo "※ APP_BASE_URL=${APP_BASE_URL} / NEXT_PATH=${NEXT_PATH} (env で override 可)"
else
  echo "エラー: magic link 生成に失敗しました (HTTP $HTTP_STATUS)" >&2
  cat /tmp/admin-generate-magiclink-response.json >&2
  echo "" >&2
  exit 1
fi
