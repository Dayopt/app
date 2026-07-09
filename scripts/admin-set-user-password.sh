#!/bin/bash

# ========================================
# Dayopt - 既存ユーザーの password 上書きスクリプト
# ========================================
# Supabase Auth Admin API で既存 user の password を上書きする。
# email_confirm も true に揃えるため、未確認 user でも login 可能にする。
#
# 用途: dogfooding / 内部テスト用に「既に作られている user に login したい」時。
# 通常の password reset flow が使えない / bypass したい時のみ使用。
#
# 前提:
#   - .op-env.local が存在し、以下を含む:
#       NEXT_PUBLIC_SUPABASE_URL=op://...
#       SUPABASE_SERVICE_ROLE_KEY=op://...
#   - 1Password CLI (op) に signin 済み (op signin)
#   - password を保存する 1Password item を事前に作成済み
#   - 対象 user の auth.users エントリが既に存在する
#
# 使い方:
#   op run --env-file=.op-env.local -- \
#     env USER_EMAIL=foo@example.com PASSWORD_ITEM_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx \
#     bash scripts/admin-set-user-password.sh
#
# 環境:
#   `.op-env.local` で注入された Supabase project に対して実行される。
#   通常は local / PR Preview の検証用。Production で使う場合は手動作業ログを残す。
# ========================================

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/admin-common.sh"

# ========================================
# 入力チェック
# ========================================
USER_EMAIL="${USER_EMAIL:-}"
PASSWORD_ITEM_ID="${PASSWORD_ITEM_ID:-}"

require_user_email_and_password_item "admin-set-user-password.sh"
require_supabase_env_verbose

auth_headers_json

# ========================================
# 1Password から password を取得
# ========================================
echo "[1Password] item ${PASSWORD_ITEM_ID} から password を取得中..."
USER_PASSWORD=$(op item get "$PASSWORD_ITEM_ID" --fields password --reveal)

if [[ -z "$USER_PASSWORD" ]]; then
  echo "エラー: 1Password から password を取得できませんでした" >&2
  exit 1
fi

# ========================================
# email から user ID を解決
# ========================================
echo "[Supabase] ${USER_EMAIL} の user ID を検索中..."

# GoTrue admin endpoint は ?email= で exact match 検索可能 (新しめのバージョン)。
# fallback として list 全件 + jq filter も試みる。
LOOKUP_URL="${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=1000"

LOOKUP_RESPONSE=$(curl -sS "${AUTH_HEADERS[@]}" "$LOOKUP_URL")

USER_ID=$(echo "$LOOKUP_RESPONSE" | jq -r --arg email "$USER_EMAIL" \
  '.users[]? | select(.email == $email) | .id' | head -n1)

if [[ -z "$USER_ID" || "$USER_ID" == "null" ]]; then
  echo "エラー: ${USER_EMAIL} の user が見つかりませんでした" >&2
  echo "lookup response の冒頭:" >&2
  echo "$LOOKUP_RESPONSE" | head -c 500 >&2
  echo "" >&2
  exit 1
fi

echo "[Supabase] User ID: $USER_ID"

# ========================================
# password を上書き + email_confirm: true
# ========================================
echo "[Supabase] password を上書き中..."

REQUEST_BODY=$(jq -n \
  --arg password "$USER_PASSWORD" \
  '{password: $password, email_confirm: true}')

HTTP_STATUS=$(curl -sS -o /tmp/admin-set-user-password-response.json -w "%{http_code}" \
  -X PUT \
  "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${USER_ID}" \
  "${AUTH_HEADERS[@]}" \
  -d "$REQUEST_BODY")

if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
  echo ""
  echo "=== 完了 ==="
  echo "Email: $USER_EMAIL"
  echo "User ID: $USER_ID"
  echo "Password: 1Password item ${PASSWORD_ITEM_ID} の値で上書き済み"
  echo "Email confirmed: true (即 login 可能)"
else
  echo "エラー: password 上書きに失敗しました (HTTP $HTTP_STATUS)" >&2
  cat /tmp/admin-set-user-password-response.json >&2
  echo "" >&2
  exit 1
fi
