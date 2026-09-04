---
status: current
last_verified: 2026-09-02
code: apps/product/src/features/review
public_docs:
  - review
lp:
  - 'Core Review metrics'
  - 'All Review metrics'
---

# Review（振り返り）

> **このファイルは陳腐化している（2026-09-03）。** レポート面は 4 章構成（配分 / 執行 / 質 / 整える）へ
> 一新中で、下記の「固定 3 セクション」「`range=day|week`」「週次補正」は既に実装から消えている。
> 現行の設計は [#2575](https://github.com/Dayopt/dayopt/issues/2575)、本文の全面書き換えは
> [#2583](https://github.com/Dayopt/dayopt/issues/2583) で行う。

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
- **セグメントの集計はアクティビティ可視性フィルタに従わない**（全アクティビティ対象）。サイドバーのチェックで合計が変わると分析ではなく表示の副作用になるため
- セグメント集計は `total` / `share` を返さない。円グラフ・積み上げ・「合計 100%」の表現は使わない（単体の数字 + 過去の自分との比較のみ）
- セグメントの CRUD（作成・アクティビティ編集・削除）は Sidebar のコンテキストメニューで行う。並び替え・フォルダ分け・共有は持たない
- Review UI と Storybook は Review feature が所有し、`/report` の Composition Layer（`app/**/(workspace)/_composition/ReportViewClient.tsx`）が timeblock 取得と diff 計算を担う

## 週次補正（見積もりバイアスの提示）

- 週次振り返りパネル（`WeeklyReflectionPanel`、「予実の傾向（Time P/L）」セクション内に表示）は、見積もりバイアス行（activity 別の平均計画時間・平均実績時間・平均偏差。1 activity あたり `n >= 2` 件の Plan×Record ペアがある行だけを含む）のうち **絶対偏差が最大の1件だけ**を選び、パネル冒頭の signal 文で提示する
- 提示するのは絶対偏差が15分以上の場合のみ。「{activity} は平均 +{bias}分長くかかっています」（超過）または「{activity} は平均 {bias}分早く終わっています」（早期完了）のいずれかを見出しに、「次の計画では、この値を初期見積もりに使えます」を detail に添える
- 対象行が無い、または最大偏差が15分未満の場合は、skip件数（0件超）→ blank rate（35%以上）→ 「この期間は予定との差が小さく収まりました」の順にフォールバックする（同パネル内、上から順に最初に条件を満たすものを1つだけ出す）
- 見積もりバイアス行自体は signal とは別に、絶対偏差の大きい順で一覧表示される（フィルタなし、上位1件に限らない）。signal は「今週まず見るべき1点」を示す別の要約であり、一覧を置き換えない
- **既知の不整合**（2026-08-25 検出、[#2386](https://github.com/Dayopt/dayopt/issues/2386)）: 平均偏差の集計元（`aggregatePlanRecordEstimationAccuracy`）は `Math.abs(実績 − 予定)` の平均であり符号を持たない。signal の「超過 / 早期完了」分岐はこの値の正負で判定するため、0 を下回ることが構造的になく、実運用ではほぼ常に「超過」文言だけが選ばれる。意図（早期完了も知らせる）どおりには動いていない

## URL契約

- `/report?date=YYYY-MM-DD&range=day|week`（`range` 省略時は `week`）
- 期間の正本は `/report` 自身の `date` と `range`。カレンダーの view とは独立している
- 旧 `?panel=review|diff|analytics` は redirect 層（`proxy.ts`）が `/report` へ写す（旧 `reviewTagId` は落ちる）

componentのvisual stateはStorybook、集計data flowとcompositionは[Engineering Architecture](../../engineering/architecture.md)を参照する。

## 関連する意思決定

- 機能スコープ（削除済み、git 履歴参照）
- 分析表現ポリシー（削除済み、git 履歴参照）（週次補正の中央値・沈黙閾値の定義元）
- ADR-025: Plan / Recordモデル（削除済み、git 履歴参照）
- 旧 workspace-shell-restructure（`docs/projects/_archive/workspace-shell-restructure/overview.md`、docs/projects 全廃に伴い #2473 で削除。git 履歴参照） — `/report` フルページ化の設計判断
