#!/bin/bash

# backup destination → 復元先 への Storage オブジェクト復元（rclone）。
#
# 演習（disaster-recovery-drill.md）と実復旧の両方でこの script を使う。
#
# sync ではなく copy を使う: 復元先に既存のオブジェクトを消さない。sync は
# destination 側の余剰ファイルを削除するため、復元用途（足りないものを戻す）には
# 危険（消えたはずのファイルを別の場所へ広げてしまう）。copy は削除を一切行わない
# ため、削除フラグ（`--delete-*`）はそもそも使っていない。
#
# 認証情報は RCLONE_CONFIG_<REMOTE名大文字>_* env var で渡す（storage-backup.sh と同じ
# 規約）。

set -euo pipefail

DEST_REMOTE="${DEST_REMOTE:-dest}"
RESTORE_TARGET_REMOTE="${RESTORE_TARGET_REMOTE:-restore_target}"
# `read -a` は IFS で分割するだけで pathname expansion をしない（unquoted `()` 展開だと
# STORAGE_BACKUP_BUCKETS にワイルドカードが混ざった時 cwd のファイル名に化ける）。
IFS=' ' read -r -a BUCKETS <<< "${STORAGE_BACKUP_BUCKETS:-avatars attachments}"
# DRY_RUN=true で実際には転送せず、rclone の予定操作だけを表示する。
# 空配列 "${arr[@]}" は macOS 標準の bash 3.2 で `set -u` 下だと unbound variable に
# なる（bash 4.4+ の array-safe expansion に非対応）ため、配列ではなく文字列にする。
DRY_RUN_FLAG=""
[[ "${DRY_RUN:-false}" == "true" ]] && DRY_RUN_FLAG="--dry-run"

command -v rclone >/dev/null 2>&1 || {
  echo "❌ rclone が見つかりません。公式配布（https://rclone.org/downloads/）からインストールしてください" >&2
  exit 1
}

for bucket in "${BUCKETS[@]}"; do
  echo "→ ${bucket} を ${DEST_REMOTE}: から ${RESTORE_TARGET_REMOTE}: へ復元します"
  # shellcheck disable=SC2086 -- DRY_RUN_FLAG は "" か "--dry-run" のみ。未quoteで
  # 空なら消え、値があれば1トークンとして展開させる意図的な word splitting。
  rclone copy \
    "${DEST_REMOTE}:${bucket}" \
    "${RESTORE_TARGET_REMOTE}:${bucket}" \
    --checksum \
    --stats-one-line \
    --stats=30s \
    ${DRY_RUN_FLAG}
done

echo "✅ Storage restore 完了（${BUCKETS[*]}）"
