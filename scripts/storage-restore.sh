#!/bin/bash

# backup destination → 復元先 への Storage オブジェクト復元（rclone）。
#
# 演習（disaster-recovery-drill.md）と実復旧の両方でこの script を使う。
#
# sync ではなく copy を使う: 復元先に既存のオブジェクトを消さない。sync は
# destination 側の余剰ファイルを削除するため、復元用途（足りないものを戻す）には
# 危険（消えたはずのファイルを別の場所へ広げてしまう）。
#
# 認証情報は RCLONE_CONFIG_<REMOTE名大文字>_* env var で渡す（storage-backup.sh と同じ
# 規約）。

set -euo pipefail

DEST_REMOTE="${DEST_REMOTE:-dest}"
RESTORE_TARGET_REMOTE="${RESTORE_TARGET_REMOTE:-restore_target}"
# shellcheck disable=SC2206 # 意図的な word splitting（空白区切りのバケット一覧）
BUCKETS=(${STORAGE_BACKUP_BUCKETS:-avatars attachments})

command -v rclone >/dev/null 2>&1 || {
  echo "❌ rclone が見つかりません。公式配布（https://rclone.org/downloads/）からインストールしてください" >&2
  exit 1
}

for bucket in "${BUCKETS[@]}"; do
  echo "→ ${bucket} を ${DEST_REMOTE}: から ${RESTORE_TARGET_REMOTE}: へ復元します"
  rclone copy \
    "${DEST_REMOTE}:${bucket}" \
    "${RESTORE_TARGET_REMOTE}:${bucket}" \
    --checksum \
    --stats-one-line \
    --stats=30s
done

echo "✅ Storage restore 完了（${BUCKETS[*]}）"
