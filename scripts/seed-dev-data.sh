#!/bin/bash

# ========================================
# Dayopt - 開発用データ投入スクリプト
# ========================================
# 使い方:
#   chmod +x scripts/seed-dev-data.sh
#   ./scripts/seed-dev-data.sh           # Preview Supabase（デフォルト）
#   USE_LOCAL_DB=true ./scripts/seed-dev-data.sh  # ローカルDB
# ========================================

set -e

# ========================================
# 環境変数の取得
# ========================================
LOCAL_URL="http://127.0.0.1:54321"
LOCAL_ANON_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

if [ "$USE_LOCAL_DB" = "true" ]; then
  echo "🔧 ローカルDB モード"
  SUPABASE_URL="$LOCAL_URL"
  ANON_KEY="$LOCAL_ANON_KEY"
  DB_TARGET="--local"
else
  echo "☁️  Preview Supabase モード"
  SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
  ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"

  if [ -z "$SUPABASE_URL" ] || [ -z "$ANON_KEY" ]; then
    echo "❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です"
    echo "   op run --env-file=.op-env.local -- pnpm db:seed を実行してください"
    exit 1
  fi
  DB_TARGET="--linked"
fi

echo "  URL: $SUPABASE_URL"
echo ""

echo "開発用データを投入します..."

# ========================================
# 1. テストユーザーの作成
# ========================================
echo "テストユーザーを作成中..."
USER_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dev@example.com",
    "password": "password123"
  }')

USER_ID=$(echo $USER_RESPONSE | jq -r '.user.id')

if [ "$USER_ID" == "null" ] || [ -z "$USER_ID" ]; then
  echo "ユーザー作成に失敗しました"
  echo $USER_RESPONSE | jq .
  exit 1
fi

echo "ユーザー作成成功: $USER_ID"

# ========================================
# 2. サンプルエントリの作成
# ========================================
echo "サンプルエントリを作成中..."

cat > /tmp/seed_entries.sql <<EOF
-- サンプルエントリ1（予定）
INSERT INTO public.entries (
  user_id, title, description, origin,
  start_time, end_time
) VALUES (
  '${USER_ID}',
  'Development task',
  'Feature implementation and code review',
  'planned',
  NOW() + INTERVAL '1 hour',
  NOW() + INTERVAL '3 hours'
);

-- サンプルエントリ2（予定）
INSERT INTO public.entries (
  user_id, title, origin,
  start_time, end_time
) VALUES (
  '${USER_ID}',
  'Auth system testing',
  'planned',
  NOW() + INTERVAL '4 hours',
  NOW() + INTERVAL '5 hours'
);

-- サンプルエントリ3（実績）
INSERT INTO public.entries (
  user_id, title, description, origin,
  start_time, end_time,
  actual_start_time, actual_end_time,
  fulfillment_score
) VALUES (
  '${USER_ID}',
  'Daily review',
  'Daily task review and next day planning',
  'planned',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '1 hour',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '50 minutes',
  3
);

-- サンプルタグ
INSERT INTO public.tags (user_id, name, color) VALUES
  ('${USER_ID}', 'Frontend', '#3b82f6'),
  ('${USER_ID}', 'Backend', '#10b981'),
  ('${USER_ID}', 'Bug fix', '#ef4444'),
  ('${USER_ID}', 'Documentation', '#8b5cf6');
EOF

supabase db execute --file /tmp/seed_entries.sql $DB_TARGET

echo "サンプルデータ投入完了"
echo ""
echo "===================="
echo "作成されたデータ"
echo "===================="
echo "ユーザー: dev@example.com"
echo "パスワード: password123"
echo "エントリ: 3件"
echo "タグ: 4件"
echo ""
echo "開発を開始できます！"
