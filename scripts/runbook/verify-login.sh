#!/bin/bash

# ========================================
# Dayopt - login 検証スクリプト
# ========================================
# /auth/v1/token?grant_type=password を curl で直接叩き、
# email + password の組合せが Supabase Auth で通るかを確認する。
#
# UI 経由の login が失敗する時の切り分けに使う:
#   - このスクリプトが成功 → password 自体は正しい (UI / CSP / form 側の問題)
#   - このスクリプトが失敗 → password が期待値と違う (admin-set-user-password の問題)
#
# 使い方:
#   op run --env-file=.op-env.human -- \
#     env USER_EMAIL=foo@example.com PASSWORD_ITEM_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx \
#     bash scripts/runbook/verify-login.sh
# ========================================

set -euo pipefail

USER_EMAIL="${USER_EMAIL:-}"
PASSWORD_ITEM_ID="${PASSWORD_ITEM_ID:-}"

if [[ -z "$USER_EMAIL" || -z "$PASSWORD_ITEM_ID" ]]; then
  echo "エラー: USER_EMAIL と PASSWORD_ITEM_ID を環境変数で指定してください" >&2
  exit 1
fi

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "エラー: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です" >&2
  exit 1
fi

echo "[1Password] item ${PASSWORD_ITEM_ID} から password を取得中..."
USER_PASSWORD=$(op item get "$PASSWORD_ITEM_ID" --fields password --reveal)

PASSWORD_LEN=${#USER_PASSWORD}
echo "[1Password] password 長さ: ${PASSWORD_LEN} 文字"

if [[ "$PASSWORD_LEN" -eq 0 ]]; then
  echo "エラー: password が空です。1Password item の password field を確認してください" >&2
  exit 1
fi

echo "[Supabase] /auth/v1/token に直接 login リクエスト..."

REQUEST_BODY=$(jq -n \
  --arg email "$USER_EMAIL" \
  --arg password "$USER_PASSWORD" \
  '{email: $email, password: $password}')

HTTP_STATUS=$(curl -sS -o /tmp/verify-login-response.json -w "%{http_code}" \
  -X POST \
  "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY")

echo ""
echo "=== 結果 ==="
echo "HTTP Status: $HTTP_STATUS"
echo ""

if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
  ACCESS_TOKEN=$(jq -r '.access_token // empty' /tmp/verify-login-response.json | head -c 20)
  USER_ID=$(jq -r '.user.id // empty' /tmp/verify-login-response.json)
  EMAIL_CONFIRMED=$(jq -r '.user.email_confirmed_at // empty' /tmp/verify-login-response.json)
  echo "✅ login 成功 (password と email_confirm は OK)"
  echo "User ID: $USER_ID"
  echo "Email confirmed at: $EMAIL_CONFIRMED"
  echo "Access token (先頭 20 文字): ${ACCESS_TOKEN}..."
  echo ""
  echo "→ UI 経由で login 失敗するなら、CSP / form / browser cache 側の問題"
else
  ERROR_CODE=$(jq -r '.error_code // empty' /tmp/verify-login-response.json)
  echo "❌ login 失敗"
  echo "Response body:"
  cat /tmp/verify-login-response.json
  echo ""
  echo ""
  # captcha protection が enabled だと curl 経由では captcha_token を生成できないため
  # 必ず captcha_failed が返る。この場合は password の正誤を判定できない (false negative)
  if [[ "$ERROR_CODE" == "captcha_failed" ]]; then
    echo "→ captcha protection が enabled のため、このスクリプトでは password 検証不可"
    echo "   (Supabase が captcha_token 無しの password grant を弾いているだけで、password の正誤は不明)"
    echo "   切り分けには Supabase Auth captcha を一時 off にするか、UI 経由で確認すること"
  else
    echo "→ password が期待値と違う or user 状態が壊れている (error_code: ${ERROR_CODE:-unknown})"
  fi
fi
