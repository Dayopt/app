# 決定ログ（append-only）

判断が分かれた記録の全履歴。STATE.md §5 には直近 5 件だけを表示し、詳細はここへ追記する。手で行を消さない（`judgment:diverged` ラベルが gardening で外れても、ここの行は残す）。既存行の削除・変更は `pnpm docs:check`（decisions-append-only ガード）が機械的に拒否する。

> 注（2026-08-27 追記）: 上記の STATE.md は 2026-08-20 に廃止済み（[#2259](https://github.com/Dayopt/dayopt/issues/2259)）で、直近 5 件の表示先は現在存在しない。全履歴の正本は本ファイル。2026-08-27 に追加した [docs/state.md](./state.md) は旧 STATE.md の後継ではなく、決定ログを持たない別物（現在の認識だけを持つ）。

- 2026-08-18: refactor(routing): 旧 route と右サイドパネルの残骸を削除する (#2195) https://github.com/Dayopt/dayopt/issues/2195
- 2026-08-18: chore(ops): Claude Routines を使った夜間自律運用を段階導入する案を検討する (#2205) https://github.com/Dayopt/dayopt/issues/2205
- 2026-08-19: epic: 分析をフルページへ戻し URL を /calendar と /report に統一する（Notion 型 Sidebar タブ） (#2181) https://github.com/Dayopt/dayopt/issues/2181
- 2026-08-20: ops(ci): private 化前提で CI を 4 層（draft/ready/main後/promote前）へ再設計する (#2269) https://github.com/Dayopt/dayopt/issues/2269
