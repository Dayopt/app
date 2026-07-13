#!/bin/bash

# Safe local dev entrypoint.
# Real secret values must not live in .env.local; use .op-env.local references.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OP_ENV_FILE="${OP_ENV_FILE:-.op-env.local}"
OP_ENV_PATH="$ROOT_DIR/$OP_ENV_FILE"

cd "$ROOT_DIR"

error() {
  echo "❌ $1" >&2
}

if [[ ! -f "$OP_ENV_PATH" ]]; then
  error "$OP_ENV_FILE が見つかりません。"
  cat >&2 <<EOF

1Password 参照ファイルを作成してください:
  cp .op-env.local.example .op-env.local

.op-env.local には実値ではなく op://... 参照だけを書きます。
詳細: docs/operations/secrets.md
EOF
  exit 1
fi

blocked_files=()
for env_file in ".env.local" "apps/product/.env.local" "apps/web/.env.local"; do
  if [[ -f "$ROOT_DIR/$env_file" ]]; then
    blocked_files+=("$env_file")
  fi
done

if (( ${#blocked_files[@]} > 0 )); then
  error ".env.local 実値ファイルが残っているため、通常 dev を停止します。"
  printf '  - %s\n' "${blocked_files[@]}" >&2
  cat >&2 <<EOF

通常の local dev は .op-env.local + op run を使います。
上記ファイルを削除または退避してから再実行してください。

素の起動が必要な一時作業だけ:
  pnpm dev:raw
EOF
  exit 1
fi

SUPABASE_TARGET="${DAYOPT_SUPABASE_TARGET:-local}"

if [[ "$SUPABASE_TARGET" == "local" ]]; then
  if ! command -v supabase >/dev/null 2>&1; then
    error "Supabase CLI が見つかりません。"
    exit 1
  fi

  if ! local_supabase_env="$(supabase status -o env 2>/dev/null)"; then
    echo "Supabase local を起動します..." >&2
    if ! supabase start >/dev/null; then
      error "Supabase local を起動できませんでした。Docker の状態を確認してください。"
      cat >&2 <<EOF

一時的に 1Password の Supabase refs をそのまま使う場合:
  DAYOPT_SUPABASE_TARGET=op pnpm dev
EOF
      exit 1
    fi

    if ! local_supabase_env="$(supabase status -o env 2>/dev/null)"; then
      error "起動後の Supabase local から URL / key を取得できませんでした。"
      exit 1
    fi
  fi

  get_local_supabase_env() {
    local key="$1"
    printf '%s\n' "$local_supabase_env" | awk -F= -v key="$key" '
      $1 == key {
        value = substr($0, index($0, "=") + 1)
        gsub(/^"/, "", value)
        gsub(/"$/, "", value)
        print value
        exit
      }
    '
  }

  LOCAL_SUPABASE_URL="$(get_local_supabase_env API_URL)"
  LOCAL_SUPABASE_ANON_KEY="$(get_local_supabase_env ANON_KEY)"
  LOCAL_SUPABASE_SERVICE_ROLE_KEY="$(get_local_supabase_env SERVICE_ROLE_KEY)"

  if [[ -z "$LOCAL_SUPABASE_URL" || -z "$LOCAL_SUPABASE_ANON_KEY" || -z "$LOCAL_SUPABASE_SERVICE_ROLE_KEY" ]]; then
    error "Supabase local の URL / key を取得できませんでした。"
    exit 1
  fi

  exec op run --env-file="$OP_ENV_PATH" -- env \
    NEXT_PUBLIC_SUPABASE_URL="$LOCAL_SUPABASE_URL" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="$LOCAL_SUPABASE_ANON_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SUPABASE_SERVICE_ROLE_KEY" \
    pnpm --filter @dayopt/product dev:raw
fi

if [[ "$SUPABASE_TARGET" != "op" ]]; then
  error "DAYOPT_SUPABASE_TARGET は local または op を指定してください。"
  exit 1
fi

exec op run --env-file="$OP_ENV_PATH" -- pnpm --filter @dayopt/product dev:raw
