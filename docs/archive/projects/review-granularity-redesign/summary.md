# review-granularity-redesign 完了サマリー

完了日: 2026-06-12

最終整理日: 2026-06-15

状態: **完了後、core-slim 方針で日次・週次へ縮小**

> **overview**: [overview.md](./overview.md)。overview は全 4 粒度を実装した時点の設計記録であり、現在の製品仕様は本 summary の「現行到達点」を正とする。

## Project ゴール

Review を「同じ画面のズーム切替」から、粒度ごとに異なる問いへ答える composition に再設計する。計画と実績の 2-layer data、rule-based 所見、Calendar への還流導線を Review の中心に据える。

## 主要コミット

| SHA        | 日付       | 内容                                                                                                 |
| ---------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `956532fe` | 2026-06-12 | 4 粒度 dispatcher、日次 / 週次 / 月次 / 年次 view、URL 復元、prefetch、Story、E2E を実装（PR #1290） |
| `e943d5d3` | 2026-06-14 | core-slim 方針で月次・年次 view を削除し、見積精度を週次へ移設（PR #1339）                           |
| `8d4be20b` | 2026-06-14 | fulfillment 軸の削除に伴い日次 KPI / 操作を整理（PR #1342）                                          |
| `72a4270b` | 2026-06-15 | Time P/L を 1 view に縮小し、未参照統計 procedure を削除（PR #1358）                                 |

初回実装 `956532fe`: **53 files / +4,108 / -590**。後続の core-slim 整理では月次・年次関連を約 1,145 行、Time P/L variant と未参照統計を約 1,816 行削減した。

## 実装時の成果

- `ReviewView` を粒度 dispatcher 化し、Daily Close / Weekly Review / Monthly Patterns / Year Map を独立 composition として実装
- 週次に rule-based 所見、KPI、Time P/L、曜日・時間帯 rhythm、次週 Calendar CTA を配置
- 日次に planned / actual 2 列 timeline、見積ずれ所見、翌日 Calendar CTA を配置
- `?g=&d=` の deep link 復元と粒度別 SSR prefetch を実装
- shared component と Storybook story、4 粒度 deep-link E2E を追加
- データが少ない期間では断定しない confidence guard を追加

## 現行到達点

2026-06-15 時点では、Review の価値を日次と週次に集中する core-slim 方針へ変更済み。

- `ReviewGranularity`: `day | week`
- `ReviewView`: `DailyReview` / `WeeklyReview` の 2 composition
- 維持: `InsightSlot`、`RuleInsightSlot`、`SummaryCard`、`NextActionLink`、URL 復元、粒度別 prefetch
- 維持: 日次 planned / actual 比較、週次見積精度・rhythm・タグ構成
- 削除: `MonthlyReview`、`YearlyReview`、年間 heatmap、月別 trend、月次用 tag balance chain
- 削除: fulfillment KPI / 採点 UI
- 縮小: Time P/L 6 variant から製品で使う core view のみへ

## 設計から変更した理由

- 月次・年次は launch core に対して情報量と保守面が大きく、日次・週次より利用価値の証明が弱かった
- fulfillment / chronotype を含む周辺軸が製品から削除され、元設計の KPI と所見入力が成立しなくなった
- 未参照 procedure と Storybook-only variant を保持するより、実利用経路に絞る方針へ変更した

## ハマり点 / 学び

- 大きな設計を一度実装しても、core value の再評価で削る判断は失敗ではなく close-out の一部
- overview を過去の意思決定記録として残す場合、current contract を summary に明記しないと「4 粒度が現仕様」と誤読される
- URL state、prefetch key、client store の 3 箇所は同じ粒度集合を共有するため、粒度削除時にまとめて更新する必要がある

## 引き継ぎ

本 project を再開して月次・年次を戻す予定はない。追加分析は、日次・週次で user value が確認できた metric のみを独立 issue で検討する。overview 内の 4 粒度 roadmap は履歴資料として扱う。
