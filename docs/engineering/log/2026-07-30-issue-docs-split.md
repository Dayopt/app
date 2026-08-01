---
status: frozen
date: 2026-07-30
---

# 進捗は issue、設計は docs に分け、停滞していた Project の status を実態へ揃える

## 背景・当時の前提

- ユーザーから「`docs/projects/` に置いている作業用情報は、issue のコメントで足りるのではないか。そちらの方が進捗を管理しやすい」という問いが出た
- 実態を数えると、`docs/projects/` 12 件のうち **7 件が `status: active` のまま 6〜15 日更新されていなかった**（`calendar-ui-refinement` と `lp-launch-content` は 2026-07-15 が最後）。`overview.md` に「現在地」表や残作業リストを持たせている project ほど内容が腐っていた
  - 例: `contact-delivery-migration` の「現在地」は 4 行が `blocked` のままだが、実際には 2026-07-21 に `v0.32.1` として出荷済みで issue #1646 も COMPLETED で close されていた
  - 例: `sentry-observability-hardening` の「Current status」は #1566 / #1599 の close を残作業として挙げていたが、両者とも close 済み
- 進捗は毎日変わるのに、docs は PR を切らないと更新できない。**更新頻度と更新コストが噛み合っていない**のが停滞の原因で、書き手の注意不足ではない

## 決定と理由

**進捗と状態の正本は issue、設計の中身と理由の正本は `docs/projects/`。同じ情報を両方に置かない。**

- **進捗を issue に寄せる**: open / closed と PR リンクで状態が勝手に最新化される。チェックリスト、担当、ラベルも issue 側の機構で足りる。`overview.md` に進捗表・残作業リスト・「現在地」を持たせない
- **設計を docs に残す**: closed issue の長いコメント列からは後で発掘できない。repo にあれば `rg` で辿れ、docs-guard が鮮度とリンクを検査し、変更が PR レビューに乗る。repo しか読めない agent（`plan-fact-checker` など）からも読める
- **設計書が必須なのは大規模のみ**という既存の規模判定（[workflow.md §規模別の進め方](../../../.claude/rules/workflow.md#規模別の進め方)）は維持する。日常の作業は issue だけで正しい

## 実施した status triage

| Project                        | 変更                  | 根拠                                                                                        |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------- |
| sentry-observability-hardening | active → **done**     | #1566 / #1599 / #1558 すべて COMPLETED。検証 surface 撤去も `966df4aad` で完了              |
| contact-delivery-migration     | active → **done**     | #1646 COMPLETED、tag `v0.32.1` と GitHub Release あり（2026-07-21）                         |
| lp-launch-content              | active → **done**     | #1486–#1496 の 11 件すべて close（うち #1491 / #1492 / #1496 は NOT_PLANNED）               |
| block-search                   | active → **done**     | service・dialog・ショートカット・モバイルシート・検索語除外すべて実装済み                   |
| calendar-ui-refinement         | active → **done**     | Delivery 4 項目すべて実装済み。2026-07-17 以降に関連コミットなし                            |
| external-calendar-import       | **active 維持**       | Step 6（#1708）の Settings UI が未実装で、`features/settings` に該当 component が存在しない |
| docs-trust-repair              | 変更なし（既に done） | 当初 active と誤認したが、実際は `done` + `summary.md` で契約を満たしていた                 |

`done` にした 5 件には `summary.md` を追加した（docs-guard が `done` に `summary.md` を要求するため、同じ変更に含めるのが必須）。

## 受入条件を満たさないまま done にした 2 件（判断の記録）

- **block-search**: overview は E2E での確認を挙げていたが、repo 全体に E2E harness が無いため実施していない。検証は unit test と Storybook。E2E 導入は本 project の範囲外として `summary.md` に明記した
- **calendar-ui-refinement**: 方針 4 の「Review summary をひとつの静かな data list にする」は、border を外した `MetricCard` を 2 列 / 4 列で並べる形に落ち着いた。文字どおりの data list ではないが、受入条件（三分割 card による label の不要な省略）は border 撤去と 2 列化で解消しているため最終形とした

いずれも「未達を隠して done にした」のではなく、差分を `summary.md` に残す形で done にしている。

## 却下した選択肢と、なぜ捨てたか

- **`docs/projects/` をやめて issue だけにする**: 設計の理由が closed issue に沈み、3 ヶ月後に発掘できなくなる。repo しか読めない agent からも見えなくなる
- **進捗表を残したまま更新頻度を上げる**: 停滞の原因は注意不足ではなく更新コストなので、同じ失敗を繰り返す。docs-guard の `last_verified` も「鮮度の宣言」であって進捗の同期機構ではない
- **status を `paused` に寄せて安全側に倒す**: 実際に出荷済み・issue close 済みのものを `paused` にすると、次に読んだ人が「止まっている作業」と誤読する。実態は done なので done にする

## 影響・やること

- 改訂: `.claude/rules/workflow.md` §設計書の保存場所 に「issue と docs の分担」を追加
- 追加: 5 project の `summary.md`、および `overview.md` の `status: done` 化
- 撤去: `contact-delivery-migration` の「現在地」表と `sentry-observability-hardening` の「Current status」を、`summary.md` への参照へ置き換えた（腐った進捗を残さない方針の適用）
- コード・CI の変更はなし
