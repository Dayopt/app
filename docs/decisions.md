# decisions.md — 全決定の時系列索引（追記のみ）

## 書式

- YYYY-MM-DD: [タグ] 決定を1文（理由: 1フレーズ）（参照: [#N](https://github.com/Dayopt/dayopt/issues/N)）
  結果(未): ← 検証可能な仮説を含む決定にだけ付ける。判明したら 結果(日付): で追記

## ルール

- 行の削除・書き換え禁止。覆すときは新しい行で「〜を撤回、Xへ」
- 参照の issue / PR 番号はリンク付きで書く（`[#N](https://github.com/Dayopt/dayopt/issues/N)`）。GitHub 外（エディタ・AI の直読み）では素の `#N` から辿れないため
- 決定したら索引に1行 ＋ 該当ストック（state.md / rules / 該当 docs）を編集（ワンセット）
- 300行を超えたら decisions/2026.md へ年別分割

## タグ語彙（増やすときはここを編集）

[product] [pricing] [sales] [cs] [infra] [auth] [payment] [db] [process]

---

- 2026-08-18: [process] 旧 route と右サイドパネルの残骸を削除する（理由: 旧 UI 経路の整理）（参照: [#2195](https://github.com/Dayopt/dayopt/issues/2195)）
- 2026-08-18: [infra] 夜間自律運用の実行 engine として Claude Routines を使う案を検討する（理由: 夜勤の自動化）（参照: [#2205](https://github.com/Dayopt/dayopt/issues/2205)）
- 2026-08-19: [product] 分析をフルページへ戻し URL を /calendar と /report に統一する（理由: Notion 型 Sidebar タブへの統合）（参照: [#2181](https://github.com/Dayopt/dayopt/issues/2181)）
- 2026-08-20: [infra] private 化前提で CI を 4 層（draft/ready/main後/promote前）へ再設計する（理由: Actions 予算制約）（参照: [#2269](https://github.com/Dayopt/dayopt/issues/2269)）
- 2026-08-28: [process] docs/projects を全廃し、設計情報の正本を issue/PR へ一本化する（理由: 散文設計書の陳腐化を防ぎ git 履歴と merged PR を正本にする）（参照: [#2473](https://github.com/Dayopt/dayopt/issues/2473)）
- 2026-08-28: [process] 意思決定ログを domain log/ から単一 append-only 索引 docs/decisions.md へ一本化する（理由: AI がオンデマンドで見た時に1ファイルで全決定が時系列に読める状態を作る）（参照: [#2475](https://github.com/Dayopt/dayopt/issues/2475)）
- 2026-08-31: [process] decisions.md の参照 issue / PR をリンク付き表記へ統一し、旧 decision テンプレ（docs/_templates/decision.md）を削除する（理由: 索引一本化で domain log/ 形式のテンプレが不要になり、素の #N は GitHub 外から辿れないため）（参照: [#2481](https://github.com/Dayopt/dayopt/issues/2481)）
