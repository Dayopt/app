---
status: frozen
date: 2026-08-20
issue: 2026
---

# Storage backup（R2）の実復元演習を実施し、初回搬出実測と完全一致を確認した

[#2026](https://github.com/Dayopt/dayopt/issues/2026)（R2 backup destination の実運用化）の最終ステップとして、`docs/operations/disaster-recovery-drill.md` の Storage 節に沿って R2 backup からの実復元演習を実施した。

---

## 前提（この演習より前に完了していたこと）

- 2026-08-18: destination（Cloudflare R2、bucket `avatars` / `attachments`、Bucket Locks 35 日 retention）を確定し、初回搬出（実 run）を完走。以後は日次 cron（07:00 JST）が差分同期する
- dry_run で 403 AccessDenied を検出し、単一バケット構成から `avatars` / `attachments` の 2 バケット構成へ是正した経緯あり（[#2026 コメント](https://github.com/Dayopt/dayopt/issues/2026)参照）

## 実施内容（2026-08-20、手作業コンシェルジュ Sonnet、User 同席・`EXPLICIT AUTHORITY` 裁可済み）

復元先はローカルディレクトリ（`~/dayopt-restore-drill`）。production Storage への書き戻しは行っていない。

1. dry-run（09:16:22）: avatars 2 オブジェクト・85.150 KiB / attachments 0 が「予定」表示され、転送は未実施であることを確認
2. 実復元（09:18:24 完了）: `scripts/storage-restore.sh` を `op run`（dotenv 連携、`ci` vault の `Cloudflare-R2-storagebackup` credential 参照）経由で実行。このレーン自体は `.claude/hooks/pre-tool-guard.sh` が `ci` vault 参照の当該 `op run` 経路を機械的にブロックする設計のため、レーン単独では実行不可と判明し、User 自身の端末で実行する形に切り替えた
3. 検証: `find . -type f` で 2 ファイルの実在を確認
   - `avatars/a629fe46-9a56-4e32-ade6-980e0d87e17c/avatar.jpg`
   - `avatars/f0a6edfa-13e6-41b6-9107-ecf0ea3f92e9/avatar.jpg`
   - 初回搬出時の実測（2 オブジェクト・85.15 KiB）と件数・サイズが完全一致
4. 後片付け: `rm -rf ~/dayopt-restore-drill` を実施し、User 確認済み

## 実測記録

```yaml
drill_date: '2026-08-20'
target: 'local directory (Storage 節限定の簡易演習。DB drill の案γ相当)'
source_backup: 'R2 backup（storage-backup-export.yml 日次 cron による最新ミラー）'
rto_measured: '約2分（認証込み、dry-run 開始から実復元完了まで）'
objects_restored: 2
objects_total_size: '85.150 KiB'
integrity: 'ok（件数・サイズとも初回搬出実測と一致）'
operator: 'User（手作業コンシェルジュ Sonnet がコマンド準備・伴走）'
```

## 反映した docs

- [disaster-recovery-drill.md §Storage](../disaster-recovery-drill.md) — 「搬出実績ゼロ」の注記を外し、実運用化・実復元演習完了を反映
- [infra.md §復元でも戻らないもの](../../engineering/infra.md) の Storage 行を更新

## 残 scope

`docs/operations/disaster-recovery-drill.md` §災害復旧手順 冒頭の RTO/RPO 未実測の警告（本節と別、DB 全体の復元演習を指す）は本件の対象外。DB 側の実復元演習は [#1879](https://github.com/Dayopt/dayopt/issues/1879)（P0、凍結解除待ち）で別途追う。
