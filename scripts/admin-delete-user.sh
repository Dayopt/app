#!/bin/bash

# ========================================
# Dayopt - 管理者によるユーザー削除スクリプト
# ========================================
# Supabase Auth Admin API で user を hard delete する。
# auth.users が削除されると ON DELETE CASCADE で関連 row (user_settings,
# entries, tags 等) も全削除される点に注意。
#
# 用途: orphan user (auth.identities が空 / 壊れた user) を一旦削除して
# admin-create-user.sh で fresh 作成する dogfooding 用。
#
# 使い方:
#   op run --env-file=.op-env.local -- \
#     env USER_EMAIL=foo@example.com \
#     bash scripts/admin-delete-user.sh
# ========================================

set -euo pipefail

USER_EMAIL="${USER_EMAIL:-}"

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

# ========================================
# email から user ID を解決
# ========================================
echo "[Supabase] ${USER_EMAIL} の user ID を検索中..."

LOOKUP_URL="${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=1000"
LOOKUP_RESPONSE=$(curl -sS "${AUTH_HEADERS[@]}" "$LOOKUP_URL")

USER_ID=$(echo "$LOOKUP_RESPONSE" | jq -r --arg email "$USER_EMAIL" \
  '.users[]? | select(.email == $email) | .id' | head -n1)

if [[ -z "$USER_ID" || "$USER_ID" == "null" ]]; then
  echo "エラー: ${USER_EMAIL} の user が見つかりませんでした (既に削除済み？)" >&2
  exit 1
fi

echo "[Supabase] User ID: $USER_ID"

# ========================================
# hard delete
# ========================================
echo "[Supabase] hard delete を実行中..."

HTTP_STATUS=$(curl -sS -o /tmp/admin-delete-user-response.json -w "%{http_code}" \
  -X DELETE \
  "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${USER_ID}" \
  "${AUTH_HEADERS[@]}")

if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
  echo ""
  echo "=== 完了 ==="
  echo "削除した user:"
  echo "  Email: $USER_EMAIL"
  echo "  User ID: $USER_ID"
  echo ""
  echo "次のステップ: admin-create-user.sh で fresh 作成"
else
  echo "エラー: 削除に失敗しました (HTTP $HTTP_STATUS)" >&2
  cat /tmp/admin-delete-user-response.json >&2
  echo "" >&2
  exit 1
fi
