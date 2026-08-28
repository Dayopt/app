#!/bin/bash

# ========================================
# Dayopt - admin-*.sh 共通ヘルパー
# ========================================
# scripts/admin-*.sh が共有する env チェック・auth header 生成をまとめる。
# 各 admin script の先頭で以下のように source する:
#   source "$(dirname "${BASH_SOURCE[0]}")/admin-common.sh"
# ========================================

require_user_email() {
  if [[ -z "${USER_EMAIL:-}" ]]; then
    echo "エラー: USER_EMAIL を指定してください" >&2
    exit 1
  fi
}

# admin-create-user.sh / admin-set-user-password.sh 用。
# USER_EMAIL と PASSWORD_ITEM_ID の両方が必要な script の入力チェック。
require_user_email_and_password_item() {
  local script_name="$1"
  if [[ -z "${USER_EMAIL:-}" || -z "${PASSWORD_ITEM_ID:-}" ]]; then
    echo "エラー: USER_EMAIL と PASSWORD_ITEM_ID を環境変数で指定してください" >&2
    echo "" >&2
    echo "使い方:" >&2
    echo "  op run --env-file=.op-env.human -- \\" >&2
    echo "    env USER_EMAIL=foo@example.com PASSWORD_ITEM_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx \\" >&2
    echo "    bash scripts/${script_name}" >&2
    exit 1
  fi
}

require_supabase_env() {
  if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    echo "エラー: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です" >&2
    exit 1
  fi
}

# admin-create-user.sh / admin-set-user-password.sh 用。
# URL / key を個別にチェックし、op run 経由での実行を促す詳細メッセージを出す。
require_supabase_env_verbose() {
  if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
    echo "エラー: NEXT_PUBLIC_SUPABASE_URL が未設定です (op run --env-file=.op-env.human 経由で実行してください)" >&2
    exit 1
  fi

  if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    echo "エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です (op run --env-file=.op-env.human 経由で実行してください)" >&2
    exit 1
  fi
}

# AUTH_HEADERS に apikey / Authorization を設定する（Content-Type なし）。
auth_headers() {
  AUTH_HEADERS=(
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  )
}

# AUTH_HEADERS に apikey / Authorization / Content-Type: application/json を設定する。
auth_headers_json() {
  AUTH_HEADERS=(
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
    -H "Content-Type: application/json"
  )
}
