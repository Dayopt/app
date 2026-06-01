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
詳細: apps/storybook/docs/operations/secrets.mdx
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

exec op run --env-file="$OP_ENV_PATH" -- pnpm --filter @dayopt/product dev:raw
