#!/bin/bash

# ========================================
# Dayopt - user record dump スクリプト
# ========================================
# email から auth.users の record を取得して状態を表示する。
# login 失敗時の切り分けに使う (email 一致 / email_confirmed / banned / 等)。
#
# 使い方:
#   op run --env-file=.op-env.local -- \
#     env USER_EMAIL=foo@example.com \
#     bash scripts/admin-show-user.sh
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
)

echo "[Supabase] ${USER_EMAIL} を含む user を検索..."

LOOKUP_URL="${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=1000"
LOOKUP_RESPONSE=$(curl -sS "${AUTH_HEADERS[@]}" "$LOOKUP_URL")

echo "$LOOKUP_RESPONSE" | jq --arg email "$USER_EMAIL" '
  .users[]?
  | select(
      (.email // "" | ascii_downcase | contains($email | ascii_downcase))
      or
      (.identities[]? | (.identity_data.email // "") | ascii_downcase | contains($email | ascii_downcase))
    )
  | {
      id,
      email,
      email_confirmed_at,
      banned_until,
      created_at,
      last_sign_in_at,
      providers: [.identities[]?.provider],
      identity_emails: [.identities[]?.identity_data.email],
    }
'
