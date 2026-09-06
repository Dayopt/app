#!/bin/bash

# ========================================
# Dayopt - profiles row 補完スクリプト
# ========================================
# auth.users は存在するが public.profiles の row が無い user に対して
# 手動で profile row を upsert する。
#
# handle_new_user trigger が auth.users INSERT で走らなかった (admin API
# 経由作成では trigger が firing しないケース等) の補修用。
#
# 使い方:
#   op run --env-file=.op-env.human -- \
#     env USER_EMAIL=foo@example.com \
#     bash scripts/runbook/admin-ensure-profile.sh
# ========================================

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/admin-common.sh"

USER_EMAIL="${USER_EMAIL:-}"

require_user_email
require_supabase_env

auth_headers

# ========================================
# email から user ID を解決
# ========================================
echo "[Supabase] ${USER_EMAIL} の user ID を検索中..."

LOOKUP_URL="${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=1000"
LOOKUP_RESPONSE=$(curl -sS "${AUTH_HEADERS[@]}" "$LOOKUP_URL")

USER_ID=$(echo "$LOOKUP_RESPONSE" | jq -r --arg email "$USER_EMAIL" \
  '.users[]? | select(.email == $email) | .id' | head -n1)

if [[ -z "$USER_ID" || "$USER_ID" == "null" ]]; then
  echo "エラー: ${USER_EMAIL} の user が見つかりませんでした" >&2
  exit 1
fi

echo "[Supabase] User ID: $USER_ID"

# ========================================
# profiles に upsert
# ========================================
echo "[Supabase] public.profiles に upsert 中..."

REQUEST_BODY=$(jq -n \
  --arg id "$USER_ID" \
  --arg email "$USER_EMAIL" \
  '{id: $id, email: $email}')

# mktemp は mkstemp(3) 経由でファイルを 0600 (owner のみ読み書き) で作成するため、
# curl が書き込む前の隙間なく world-readable な固定パスを避けられる。応答には
# live な token / 個人情報が載るので、抽出後は trap で確実に削除する。
# 固定パスのままだと (1) 同一ホストの別 uid が読める (2) 攻撃者が先に symlink を
# 置くと curl -o が任意ファイルを operator 権限で truncate する。
RESPONSE_FILE=$(mktemp "${TMPDIR:-/tmp}/admin-ensure-profile-response.XXXXXX")
trap 'rm -f "$RESPONSE_FILE"' EXIT

HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?on_conflict=id" \
  "${AUTH_HEADERS[@]}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d "$REQUEST_BODY")

if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
  echo ""
  echo "=== 完了 ==="
  echo "User ID: $USER_ID"
  echo "Email: $USER_EMAIL"
  echo "profile row を upsert しました"
  echo ""
  echo "Response:"
  cat "$RESPONSE_FILE"
  echo ""
else
  echo "エラー: profile upsert に失敗しました (HTTP $HTTP_STATUS)" >&2
  cat "$RESPONSE_FILE" >&2
  echo "" >&2
  exit 1
fi
