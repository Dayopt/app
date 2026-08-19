---
status: current
last_verified: 2026-08-19
code: apps/product/src/features/review
public_docs:
  - review
lp:
  - 'Core Review metrics'
  - 'All Review metrics'
---

# Review（振り返り）

`/report` フルページで Plan と Record の差分を読み、次の計画に使うための振り返り機能。点数・streak・評価ラベルは使わず、数字と事実を静かに示す。

## 現在の振る舞い

- `/report` は独立したフルページ（1 スクロール構成）。カレンダー内パネルは廃止済み
- セクションは固定 3 つ、この順で並ぶ:
  1. **差分** — 今日/今週の予定と実績のズレ
  2. **予実の傾向（Time P/L）** — アクティビティ別の予実比較
  3. **セグメント** — 選択したアクティビティの組み合わせの単体の数字 + 直前期間比較
- セクションはそれぞれ独立した loading/error を持つ。1 つのデータ取得が失敗しても他のセクションは描画され続ける
- 週末非表示時は、実際に表示されている日だけを集計対象にする。先頭日と末尾日の間にある非表示の土日は含めない
- 差分・Time P/L は表示期間と、その直前の同じ日数を比較する。週末非表示時は比較期間も土日を飛ばす。既存の集計結果を rule-based な純粋関数で要約し、LLM や in-app AI は使わない
- 差分は未記録、やらなかった、予定に対する記録、予定外の記録を基礎に表示する
- 予定に対する記録は Plan 単位でまとめ、複数の関連 Record がある場合は記録時間を合計して Plan との差分を計算する
- Plan との差分が `±0` の項目は一覧に表示しない
- 差分の正負は符号と方向 icon で示し、成功・失敗を意味する色や評価ラベルは使わない
- Plan と Record が別日の場合、Plan は Plan 自身の日、Record は Record 自身の日へ計上する
- **セグメントの集計はタグ/アクティビティ可視性フィルタに従わない**（全アクティビティ対象）。サイドバーのチェックで合計が変わると分析ではなく表示の副作用になるため
- セグメント集計は `total` / `share` を返さない。円グラフ・積み上げ・「合計 100%」の表現は使わない（単体の数字 + 過去の自分との比較のみ）
- セグメントの CRUD（作成・アクティビティ編集・削除）は Sidebar のコンテキストメニューで行う。並び替え・フォルダ分け・共有は持たない
- Review UI と Storybook は Review feature が所有し、`/report` の Composition Layer（`app/**/(workspace)/_composition/ReportViewClient.tsx`）が timeblock 取得と diff 計算を担う

## URL契約

- `/report?date=YYYY-MM-DD&range=day|week`（`range` 省略時は `week`）
- 期間の正本は `/report` 自身の `date` と `range`。カレンダーの view とは独立している
- 旧 `?panel=review|diff|analytics` は redirect 層（`proxy.ts`）が `/report` へ写す（旧 `reviewTagId` は落ちる）

componentのvisual stateはStorybook、集計data flowとcompositionは[Engineering Architecture](../../engineering/architecture.md)を参照する。

## 関連する意思決定

- [機能スコープ](../log/2026-06-16-feature-non-adoption.md)
- [分析表現ポリシー](../log/2026-07-10-analytics-expression-policy.md)
- [ADR-025: Plan / Recordモデル](../log/2026-07-09-time-model-split.md)
- [workspace-shell-restructure](../../projects/_archive/workspace-shell-restructure/overview.md) — `/report` フルページ化の設計判断
