#!/bin/bash

# Supabase Storage の定期搬出（rclone、S3 互換 endpoint 経由）。
#
# avatars / attachments には DB backup 経由の復元元が無い（#1971）。この script は
# source（Supabase Storage の S3 互換 endpoint）から destination（バックアップ先）へ
# 全オブジェクトを同期する。
#
# 認証情報は RCLONE_CONFIG_<REMOTE名大文字>_* env var で渡す。config ファイルは repo に
# 置かず、実値も書かない（例: RCLONE_CONFIG_SOURCE_TYPE=s3, ..._ENDPOINT=..., 等）。
# 実行前に SOURCE_REMOTE / DEST_REMOTE それぞれの env-based remote 定義が export
# 済みであることが前提。
#
# 対象バケットの正本は supabase/migrations/00000000000000_baseline.sql の
# storage.buckets INSERT（avatars / attachments）。
#
# ⚠ sync は destination を source に合わせるため、SOURCE_REMOTE の設定ミス・読み取り
# 失敗（空を返す等）が起きると destination 側の既存オブジェクトを削除しうる。実運用化
# （#2026）では destination 側の versioning / object lock を必須にするか、
# `--max-delete` で削除上限を設ける。

set -euo pipefail

SOURCE_REMOTE="${SOURCE_REMOTE:-source}"
DEST_REMOTE="${DEST_REMOTE:-dest}"
# `read -a` は IFS で分割するだけで pathname expansion をしない（unquoted `()` 展開だと
# STORAGE_BACKUP_BUCKETS にワイルドカードが混ざった時 cwd のファイル名に化ける）。
IFS=' ' read -r -a BUCKETS <<< "${STORAGE_BACKUP_BUCKETS:-avatars attachments}"

command -v rclone >/dev/null 2>&1 || {
  echo "❌ rclone が見つかりません。公式配布（https://rclone.org/downloads/）からインストールしてください" >&2
  exit 1
}

for bucket in "${BUCKETS[@]}"; do
  echo "→ ${bucket} を ${SOURCE_REMOTE}: から ${DEST_REMOTE}: へ搬出します"
  rclone sync \
    "${SOURCE_REMOTE}:${bucket}" \
    "${DEST_REMOTE}:${bucket}" \
    --checksum \
    --create-empty-src-dirs=false \
    --stats-one-line \
    --stats=30s
done

echo "✅ Storage backup 完了（${BUCKETS[*]}）"
