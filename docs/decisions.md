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
- 2026-08-31: [process] 内製クロスレビュー必須の保護対象を「外部契約 or 不可逆」だけへ絞り、timeblock / calendar / lib/time の時間不変条件を必須側から外す（ただし features/timeblock/server の MCP 公開契約・service role クエリ・privacy 境界は残す）（理由: 可逆かつ test が担保する変更まで必須にすると Workflow 禁止のクラウドセッションで merge が止まるだけだったため）（参照: [#2489](https://github.com/Dayopt/dayopt/issues/2489)）
- 2026-08-31: [process] push 前セルフレビューを risk に比例させる（自動委任条件カテゴリ・新規ロジックに限定、typo / docs / パターン追従は機械検証のみ）と AGENTS.md §レーン運用 へ明文化する（理由: #2479 の圧縮で scope 定義ごと消え、全 push 一律の旧運用は保護対象を絞ったレビュー設計と不整合のため）（参照: [#2508](https://github.com/Dayopt/dayopt/issues/2508)）
- 2026-09-01: [process] クロスレビュー必須 PR の merge 条件を「内製 subagent marker + Codex 自身の GitHub review object（現 HEAD 束縛）」の独立2系統 AND にし、2026-08-13 の Codex 全PR適用停止を必須PRに限り撤回する（理由: 同一モデル系列の中で役割を分けただけのレビューを独立とは呼べないため）（参照: [#2529](https://github.com/Dayopt/dayopt/issues/2529)）
- 2026-09-01: [process] review:full を Issue / PR 共通の高リスクシグナルとし、review:full Issue は実装前 Codex Issue Review（本文 fingerprint 束縛）を必須化、Closes した issue の review:full を PR のクロスレビュー要否へ継承する（理由: 高リスク変更は Issue と PR の二段階で独立反証する）（参照: [#2530](https://github.com/Dayopt/dayopt/issues/2530)）
- 2026-09-01: [process] 夜勤の「毎朝の読み物」層（日次盤面 issue・常設運行記録への毎晩1コメント・DoD 監査候補・朝編成ブリーフ・05:00 JST 蒸留層）を全廃し、「問題があれば issue、無ければ無音」へ集約する（理由: 毎日必ず何かが増えるコストが読まれる価値を上回ったため）（参照: [#2525](https://github.com/Dayopt/dayopt/issues/2525)）
- 2026-09-02: [process] epic #2162（タグ→アクティビティ/カテゴリー/セグメント全置換）を Step 9（tags 物理削除、#2175）未実施のままクローズし、#2175 を独立issueとして残す（理由: 可逆な Step 0〜8 は全て merge 済みで、残る Step 9 は EXPLICIT AUTHORITY の不可逆 migration であり #2396 の移行判断に従属するため、epic として束ねておく理由がない）（参照: [#2162](https://github.com/Dayopt/dayopt/issues/2162)）
