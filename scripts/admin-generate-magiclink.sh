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
#   op run --env-file=.op-env.human -- \
#     env USER_EMAIL=foo@example.com \
#     bash scripts/admin-generate-magiclink.sh
# ========================================

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/admin-common.sh"

USER_EMAIL="${USER_EMAIL:-}"
APP_BASE_URL="${APP_BASE_URL:-https://app-dayopt.vercel.app}"
NEXT_PATH="${NEXT_PATH:-/calendar/day}"

require_user_email
require_supabase_env

auth_headers_json

echo "[Supabase] ${USER_EMAIL} の magic link を生成中..."

# /auth/confirm route が verifyOtp({ token_hash, type }) を呼ぶ形なので、
# Supabase の verify endpoint は経由せず token_hash を直接 app の confirm route に渡す。
# これで redirect_to allowlist の問題を bypass できる。
REQUEST_BODY=$(jq -n \
  --arg email "$USER_EMAIL" \
  '{type: "magiclink", email: $email}')

# mktemp は mkstemp(3) 経由でファイルを 0600 (owner のみ読み書き) で作成するため、
# curl が書き込む前の隙間なく world-readable な固定パスを避けられる。hashed_token は
# single-use の live login token なので、抽出後は trap で確実に削除する。
RESPONSE_FILE=$(mktemp "${TMPDIR:-/tmp}/admin-generate-magiclink-response.XXXXXX")
trap 'rm -f "$RESPONSE_FILE"' EXIT

HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST \
  "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link" \
  "${AUTH_HEADERS[@]}" \
  -d "$REQUEST_BODY")

if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
  HASHED_TOKEN=$(jq -r '.hashed_token // .properties.hashed_token // empty' "$RESPONSE_FILE")
  if [[ -z "$HASHED_TOKEN" ]]; then
    echo "エラー: hashed_token が response に含まれていません" >&2
    cat "$RESPONSE_FILE" >&2
    exit 1
  fi

  # app の /auth/confirm route が verifyOtp({ token_hash, type }) で session を確立する。
  # next param で login 後の遷移先を指定。
  CONFIRM_URL="${APP_BASE_URL}/ja/auth/confirm?token_hash=${HASHED_TOKEN}&type=magiclink&next=${NEXT_PATH}"

  echo ""
  echo "=== 完了 ==="
  echo ""
  echo "下記 URL をブラウザで開けば自動的に login します:"
  echo ""
  echo "$CONFIRM_URL"
  echo ""
  # macOS なら open(1) で自動起動を試みる。non-macOS / headless 環境では best-effort
  # で諦め、上に出力した URL を operator が手で開けるようにする (set -e を踏まないよう
  # || true でガード)。
  if command -v open >/dev/null 2>&1; then
    open "$CONFIRM_URL" 2>/dev/null || echo "(open コマンドで自動起動できませんでした。上記 URL を手動で開いてください)"
  fi
  echo ""
  echo "※ token は短命 (デフォルト 1 時間)、single-use です"
  echo "※ APP_BASE_URL=${APP_BASE_URL} / NEXT_PATH=${NEXT_PATH} (env で override 可)"
  echo "※ op run 配下では URL の一部が <concealed by 1Password> で masking される"
  echo "   ことがあります。その場合は op run を外して同じ env で再実行してください。"
else
  echo "エラー: magic link 生成に失敗しました (HTTP $HTTP_STATUS)" >&2
  cat "$RESPONSE_FILE" >&2
  echo "" >&2
  exit 1
fi
