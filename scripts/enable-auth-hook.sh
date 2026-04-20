#!/bin/bash

# ========================================
# Dayopt - Auth Hook 有効化スクリプト
# ========================================
# custom_access_token hook を Supabase プロジェクトで有効化する。
# JWTに subscription_status を埋め込み、proProcedureの毎リクエストDBクエリを排除。
#
# 前提:
#   - マイグレーション適用済み（custom_access_token_hook 関数が存在すること）
#     ※ db push は --project-ref 非対応。リンク済みプロジェクトに対して別途実行:
#       supabase link --project-ref <ref> && supabase db push
#   - SUPABASE_ACCESS_TOKEN が設定済み
#     発行: https://supabase.com/dashboard/account/tokens
#
# 使い方:
#   chmod +x scripts/enable-auth-hook.sh
#   ./scripts/enable-auth-hook.sh
#
# 現在は単一 project 運用のため、引数なしで Production project に適用する。
# ========================================

set -euo pipefail

# ========================================
# プロジェクト参照ID
# ========================================
PROJECT_REF="yvglwblxrnrenfifsnje"

# ========================================
# アクセストークン確認
# ========================================
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "エラー: SUPABASE_ACCESS_TOKEN が未設定です"
  echo "発行先: https://supabase.com/dashboard/account/tokens"
  echo ""
  echo "  export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx"
  echo "  $0"
  exit 1
fi

# ========================================
# Auth Hook 有効化
# ========================================
echo "[Production] custom_access_token hook を有効化中..."

HTTP_STATUS=$(curl -s -o /tmp/auth-hook-response.json -w "%{http_code}" \
  -X PATCH \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED": true,
    "GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI": "pg-functions://postgres/public/custom_access_token_hook"
  }')

if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
  echo "[Production] Auth Hook 有効化完了 (HTTP $HTTP_STATUS)"
else
  echo "エラー: Auth Hook の有効化に失敗しました (HTTP $HTTP_STATUS)"
  cat /tmp/auth-hook-response.json
  exit 1
fi

# ========================================
# 3. 確認
# ========================================
echo ""
echo "=== 完了 ==="
echo "環境: Production ($PROJECT_REF)"
echo "Hook: custom_access_token_hook"
echo ""
echo "既存ユーザーのJWTは最大1時間で自動リフレッシュされ、"
echo "subscription_status クレームが反映されます。"
echo "それまではDBフォールバックが動作するため、ダウンタイムはありません。"
