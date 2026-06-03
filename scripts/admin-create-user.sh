#!/bin/bash

# ========================================
# Dayopt - 管理者によるユーザー作成スクリプト
# ========================================
# Supabase Auth Admin API で email + password の user を作成する。
# email_confirm: true を指定するため confirmation メールをスキップして即 login 可能。
#
# 用途: dogfooding / 内部テスト用の account を CLI で作る。通常の signup flow が
# 使えない / bypass したい時のみ使用。
#
# 前提:
#   - .op-env.local が存在し、以下を含む:
#       NEXT_PUBLIC_SUPABASE_URL=op://...
#       SUPABASE_SERVICE_ROLE_KEY=op://...
#   - 1Password CLI (op) に signin 済み (op signin)
#   - password を保存する 1Password item を事前に作成済み
#
# 使い方:
#   op run --env-file=.op-env.local -- \
#     env USER_EMAIL=foo@example.com PASSWORD_ITEM_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx \
#     bash scripts/admin-create-user.sh
#
# 環境:
#   `.op-env.local` で注入された Supabase project に対して実行される。
#   通常は local / PR Preview の検証用。Production で使う場合は手動作業ログを残す。
# ========================================

set -euo pipefail

# ========================================
# 入力チェック
# ========================================
USER_EMAIL="${USER_EMAIL:-}"
PASSWORD_ITEM_ID="${PASSWORD_ITEM_ID:-}"

if [[ -z "$USER_EMAIL" || -z "$PASSWORD_ITEM_ID" ]]; then
  echo "エラー: USER_EMAIL と PASSWORD_ITEM_ID を環境変数で指定してください" >&2
  echo "" >&2
  echo "使い方:" >&2
  echo "  op run --env-file=.op-env.local -- \\" >&2
  echo "    env USER_EMAIL=foo@example.com PASSWORD_ITEM_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx \\" >&2
  echo "    bash scripts/admin-create-user.sh" >&2
  exit 1
fi

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
  echo "エラー: NEXT_PUBLIC_SUPABASE_URL が未設定です (op run --env-file=.op-env.local 経由で実行してください)" >&2
  exit 1
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です (op run --env-file=.op-env.local 経由で実行してください)" >&2
  exit 1
fi

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
# Supabase Auth Admin API で user 作成
# ========================================
echo "[Supabase] ${USER_EMAIL} を作成中..."

REQUEST_BODY=$(jq -n \
  --arg email "$USER_EMAIL" \
  --arg password "$USER_PASSWORD" \
  '{email: $email, password: $password, email_confirm: true}')

HTTP_STATUS=$(curl -sS -o /tmp/admin-create-user-response.json -w "%{http_code}" \
  -X POST \
  "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY")

if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
  USER_ID=$(jq -r '.id' /tmp/admin-create-user-response.json)
  echo ""
  echo "=== 完了 ==="
  echo "Email: $USER_EMAIL"
  echo "User ID: $USER_ID"
  echo "Email confirmed: true (即 login 可能)"
else
  echo "エラー: user 作成に失敗しました (HTTP $HTTP_STATUS)" >&2
  cat /tmp/admin-create-user-response.json >&2
  echo "" >&2
  exit 1
fi
