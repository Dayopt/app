#!/usr/bin/env bash
# Dayopt 1Password vault / item 骨組み作成スクリプト
#
# 使い方:
#   ./scripts/setup-1password.sh             # dry-run (全コマンドを echo)
#   ./scripts/setup-1password.sh --execute   # 実際に作成
#
# 前提:
#   - `op` CLI インストール済み (brew install 1password-cli)
#   - `op account list` でサインイン済み
#   - 初回専用。vault / item が既に存在すると重複作成される
#
# 詳細: .storybook/docs/operations/secrets.mdx

set -euo pipefail

# ---------- モード判定 ----------
MODE="${1:-dry-run}"
if [ "$MODE" = "--execute" ]; then
  echo "🔴 EXECUTE MODE — 実際に 1Password に書き込みます"
  run() { op "$@"; }
else
  echo "🟢 DRY-RUN MODE — コマンドを echo するのみ。実行は --execute を渡す"
  run() { printf '  op '; printf '%q ' "$@"; printf '\n'; }
fi
echo ""

# ---------- 前提チェック ----------
if ! command -v op >/dev/null 2>&1; then
  echo "❌ op CLI が見つかりません。brew install 1password-cli"
  exit 1
fi

if ! op account list >/dev/null 2>&1; then
  echo "❌ 1Password にサインインしていません。eval \"\$(op signin)\""
  exit 1
fi

# 重複作成防止: 3 vault に item が既に存在していないか確認
# vault だけ作られて item が無い状態での再実行は許容 (Phase 1 で中断後の続行)
for vault in Dayopt-Staging Dayopt-Production Dayopt-Shared; do
  if op vault get "$vault" >/dev/null 2>&1; then
    item_count=$(op item list --vault="$vault" --format=json 2>/dev/null | jq 'length')
    if [ "$item_count" -gt 0 ]; then
      echo "❌ vault '$vault' に既に $item_count 個の item が存在します。このスクリプトは初回専用です。"
      exit 1
    fi
  fi
done

# Phase 1 skip 判定: 3 vault 全てが既に存在すれば skip
SKIP_PHASE1=true
for vault in Dayopt-Staging Dayopt-Production Dayopt-Shared; do
  if ! op vault get "$vault" >/dev/null 2>&1; then
    SKIP_PHASE1=false
    break
  fi
done

# ---------- NOTES テンプレ ----------
NOTES='発行日:
発行場所:
権限/scope:
再発行手順:
revoke手順:
依存先: '

# =========================================================
# Phase 1: Vault 作成
# =========================================================
if [ "$SKIP_PHASE1" = "true" ]; then
  echo "── Phase 1: Vault 作成 (skip: 3 vault 作成済み) ─────────────"
else
  echo "── Phase 1: Vault 作成 ─────────────────────────"
  run vault create Dayopt-Staging --description "Dayopt Staging 環境の API credentials (普段 signin)"
  run vault create Dayopt-Production --description "Dayopt Production 環境の API credentials (触る時だけ unlock)"
  run vault create Dayopt-Shared --description "Dayopt 環境非依存の API credentials / SSH / domain"
fi
echo ""

# =========================================================
# Phase 2: Item 骨組み作成
# =========================================================
echo "── Phase 2: Item 作成 (値は空、NOTES テンプレ付き) ─────────────"

# ----- Dayopt-Staging -----
echo "  [Dayopt-Staging]"

run item create --category=apicredential --vault=Dayopt-Staging --title=supabase \
  --tags=dayopt,staging notesPlain="$NOTES" \
  'url[text]=' \
  'anon-key[concealed]=' \
  'service-role-key[concealed]=' \
  'send-email-hook-secret[concealed]=' \
  'cron-secret[concealed]=' \
  'db-password[concealed]=' \
  'access-token[concealed]=' \
  'project-ref[text]='

run item create --category=apicredential --vault=Dayopt-Staging --title=upstash \
  --tags=dayopt,staging notesPlain="$NOTES" \
  'rest-url[text]=' \
  'rest-token[concealed]='

run item create --category=apicredential --vault=Dayopt-Staging --title=recaptcha \
  --tags=dayopt,staging notesPlain="$NOTES" \
  'secret-v3[concealed]=' \
  'secret-v2[concealed]=' \
  'site-key-v3[text]=' \
  'site-key-v2[text]='

run item create --category=apicredential --vault=Dayopt-Staging --title=stripe-test \
  --tags=dayopt,staging notesPlain="$NOTES" \
  'secret-key[concealed]=' \
  'webhook-signing-secret[concealed]=' \
  'pro-price-id[text]=' \
  'publishable-key[text]='

run item create --category=apicredential --vault=Dayopt-Staging --title=resend \
  --tags=dayopt,staging notesPlain="$NOTES" \
  'webhook-secret[concealed]='

run item create --category=apicredential --vault=Dayopt-Staging --title=sentry \
  --tags=dayopt,staging notesPlain="$NOTES" \
  'dsn[text]=' \
  'org-slug[text]=' \
  'project-slug[text]='

run item create --category=apicredential --vault=Dayopt-Staging --title=slack \
  --tags=dayopt,staging notesPlain="$NOTES" \
  'billing-webhook-url[concealed]='

run item create --category=apicredential --vault=Dayopt-Staging --title=app \
  --tags=dayopt,staging notesPlain="$NOTES"$'\n⚠️ recovery-code-pepper は失うと全ユーザーの recovery code が復旧不能。別メディアに二重バックアップ必須' \
  'url[text]=' \
  'recovery-code-pepper[concealed]='

# ----- Dayopt-Production -----
echo "  [Dayopt-Production]"

run item create --category=apicredential --vault=Dayopt-Production --title=supabase \
  --tags=dayopt,production notesPlain="$NOTES" \
  'url[text]=' \
  'anon-key[concealed]=' \
  'service-role-key[concealed]=' \
  'send-email-hook-secret[concealed]=' \
  'cron-secret[concealed]=' \
  'db-password[concealed]=' \
  'access-token[concealed]=' \
  'project-ref[text]='

run item create --category=apicredential --vault=Dayopt-Production --title=upstash \
  --tags=dayopt,production notesPlain="$NOTES" \
  'rest-url[text]=' \
  'rest-token[concealed]='

run item create --category=apicredential --vault=Dayopt-Production --title=recaptcha \
  --tags=dayopt,production notesPlain="$NOTES" \
  'secret-v3[concealed]=' \
  'secret-v2[concealed]=' \
  'site-key-v3[text]=' \
  'site-key-v2[text]='

run item create --category=apicredential --vault=Dayopt-Production --title=stripe-live \
  --tags=dayopt,production notesPlain="$NOTES"$'\n⚠️ 本番 Stripe キー。ローカル .env.local からは参照しない' \
  'secret-key[concealed]=' \
  'webhook-signing-secret[concealed]=' \
  'pro-price-id[text]=' \
  'publishable-key[text]='

run item create --category=apicredential --vault=Dayopt-Production --title=resend \
  --tags=dayopt,production notesPlain="$NOTES" \
  'webhook-secret[concealed]='

run item create --category=apicredential --vault=Dayopt-Production --title=sentry \
  --tags=dayopt,production notesPlain="$NOTES" \
  'dsn[text]=' \
  'org-slug[text]=' \
  'project-slug[text]='

run item create --category=apicredential --vault=Dayopt-Production --title=slack \
  --tags=dayopt,production notesPlain="$NOTES" \
  'billing-webhook-url[concealed]='

run item create --category=apicredential --vault=Dayopt-Production --title=app \
  --tags=dayopt,production notesPlain="$NOTES"$'\n⚠️ recovery-code-pepper は失うと全ユーザーの recovery code が復旧不能。別メディアに二重バックアップ必須' \
  'url[text]=' \
  'recovery-code-pepper[concealed]='

# ----- Dayopt-Shared -----
echo "  [Dayopt-Shared]"

run item create --category=apicredential --vault=Dayopt-Shared --title=anthropic \
  --tags=dayopt,shared notesPlain="$NOTES" \
  'api-key-dev[concealed]=' \
  'api-key-prod[concealed]='

run item create --category=apicredential --vault=Dayopt-Shared --title=resend \
  --tags=dayopt,shared notesPlain="$NOTES"$'\nwebhook secret は Dayopt-Staging/resend, Dayopt-Production/resend に別途' \
  'api-key-dev[concealed]=' \
  'api-key-prod[concealed]=' \
  'from-email[text]='

run item create --category=apicredential --vault=Dayopt-Shared --title=vercel \
  --tags=dayopt,shared notesPlain="$NOTES" \
  'token[concealed]=' \
  'team-id[text]=' \
  'project-id-staging[text]=' \
  'project-id-production[text]='

run item create --category=apicredential --vault=Dayopt-Shared --title=google \
  --tags=dayopt,shared notesPlain="$NOTES" \
  'site-verification[text]='

run item create --category=login --vault=Dayopt-Shared --title=domain \
  --tags=dayopt,shared notesPlain="$NOTES"$'\n⚠️ レジストラ乗っ取られたら事業終了。recovery codes を別メディアに二重バックアップ' \
  'username=' \
  'password[concealed]=' \
  'registrar-url[url]=' \
  'recovery-codes[concealed]=' \
  '2fa-notes[text]='

run item create --category=securenote --vault=Dayopt-Shared --title=recovery-codes \
  --tags=dayopt,shared \
  notesPlain="横断 index。正本は各サービスの Login item 側。ここは横串確認用。
更新時は両方同時に。

stripe:
supabase:
vercel:
github:
apple:
google:
anthropic: "

# github / github-ssh / apple-developer は既存 item move または後日 GUI 作成推奨 (Phase 3 参照)
echo ""

# =========================================================
# Phase 3: 既存 item の移動 (情報のみ、実行は GUI 推奨)
# =========================================================
cat <<'EOF'
── Phase 3: 既存 item の移動 (GUI で手動実施推奨) ─────────────

以下は Development / ワーク vault の既存 item を Dayopt-Shared に移動する候補。
GUI で item を右クリック → Move → Dayopt-Shared を選択するのが最も安全。

  Development/GitHub PAT - Dayopt Website Contact  →  Dayopt-Shared/github にリネーム
      (既に Dayopt 専用 PAT なので、move + rename + "contact-repo" field 追加)

  Development/GitHub (SSH_KEY)  →  Dayopt-Shared/github-ssh にリネーム
      ※ Dayopt commit にこの key を使っているか確認してから移動する
      ※ 別用途でも使っているなら、Dayopt 用に新規 SSH key 発行を推奨

以下は移動せず既存 vault に残す (アカウント本体は分散させない方針):

  Development/GitHub (LOGIN)       → 残す (TOTP + recovery codes の正本)
  Development/Supabase (LOGIN)     → 残す
  Development/Sentry (LOGIN)       → 残す
  Development/Vercel (LOGIN)       → 残す
  ワーク/Stripe (LOGIN)            → 残す
  ワーク/Resend (LOGIN)            → 残す
  ワーク/Slack (LOGIN)             → 残す

apple-developer は .p8 / 証明書ファイルが揃ってから GUI で Document item 作成。
EOF

echo ""
echo "✅ 完了。Phase 2 の新規 item は全て空。次ステップ: 1Password GUI で値投入 → MISSING チェック"
