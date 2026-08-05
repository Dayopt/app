---
status: done
last_verified: 2026-07-16
code:
  - apps/product/src/features/timeblock
  - apps/product/src/features/calendar
  - packages/domain
  - packages/foundations
  - scripts
  - supabase
---

# chronotype-fulfillment-removal — 残存契約を完全に撤去する

現行 UI に接続されていない Chronotype と FulfillmentScore を、将来候補や互換資産として温存せず、application contract と DB schema から段階的に撤去する。破壊的な column drop の deploy 間隙を避けるため、runtime 撤去と schema drop は別 PR に分ける。

## Goal

Chronotype と FulfillmentScore を Dayopt のプロダクト概念、runtime contract、design system、DB schema から完全に削除する。

## 決定

- Chronotype は `packages/domain`、Eagle taxonomy、design token から削除し、Dayopt の現在機能・将来候補として扱わない
- FulfillmentScore は Record input / output、Calendar projection、statistics input、data export、design token、公開 docs から削除する
- 一般的な生体リズムを扱う editorial content の `chronotype` や、心理学論文名に含まれる `fulfillment` は Dayopt の機能契約ではないため残す
- append-only log、完了済み Project、適用済み migration は履歴として書き換えない

## Delivery

### Phase 1 — runtime と表示契約の撤去（Issue #1540）

1. Record の tRPC response を明示列 projection にし、DB column が残る期間も `fulfillment_score` を外部へ返さない
2. Settings response を明示 projection にし、`chronotype_settings` を取得・更新応答へ含めない
3. JSON / CSV export を明示 projection にし、両 field を export contract へ含めない。restore UI / API は未実装のため旧 export の再投入互換は追加しない
4. Record schema / service / optimistic update / Calendar adapter / statistics service から fulfillment の読み書きと集計を削除する
5. Chronotype domain module、chronotype / fulfillment design token、関連 Story、Eagle taxonomy を削除する
6. dev seed、ユーザー向け docs、stock docs を現行 contract へ更新する
7. focused test と repository quality gate を通し、DB schema と generated types だけが transitional residue として残る状態にする

### Phase 2 — physical schema の撤去（Issue #1625 / 別 PR）

1. Phase 1 deploy 後に Sentry で `chronotype_settings` / `fulfillment_score` の参照エラーがないことを確認する
2. production の records / settings / JSON export / MCP contract probe で両 field が応答に存在しないことを確認する
3. 両 column の非 null 件数を監査し、既存値を復元せず破棄することを明示確認する
4. 新規 migration で `user_settings.chronotype_settings` と `records.fulfillment_score` を drop する
5. canonical schema と seed を更新し、generated types を再生成する
6. Preview Branch と local schema で migration を検証し、production 適用後に対象語の現行残存がゼロであることを確認する

Phase 1 と Phase 2 は 2026-07-16 に完了した。production の適用結果と最終契約は [summary.md](./summary.md) を参照する。

## Acceptance Criteria

### Phase 1

- production runtime が両 column を明示的に読み書きせず、records / settings / export / MCP response にも両 field が現れない
- `packages/domain` と `packages/foundations` に chronotype / fulfillment 専用資産が残らない
- Storybook / Eagle taxonomy / user docs / stock docs が両機能を現在機能または将来候補として扱わない
- current schema、generated types、historical migration / log、一般 editorial content 以外に対象語が残らない
- `pnpm test:run`、`pnpm docs:check`、`pnpm typecheck`、`pnpm lint`、`pnpm lint:boundaries`、token / i18n / web content の関連 check が通る

### Phase 2

- drop 前の非 null 件数とデータ破棄判断が記録されている
- production DB と canonical schema に `chronotype_settings` / `fulfillment_score` が存在しない
- generated database types に両 field が存在しない
- migration の Preview Branch 適用と local schema verification が通る

## Reversibility

| Phase   | Reversibility    | 根拠                                                                                                                                                                             |
| ------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 | `[minutes]`      | code・token・docs・seed の変更だけで、git revert で戻せる                                                                                                                        |
| Phase 2 | `[irreversible]` | column drop 後は既存の chronotype setting と fulfillment score の値を復元できない。ユーザーが両機能を不要と判断し、Phase 1 deploy 後の参照ゼロ確認を解除条件にすることで実施する |

## Existing Code to Reuse

- `apps/product/src/features/timeblock/server/record-service.ts` の service boundary
- `apps/product/src/features/timeblock/server/timeblock-types.ts` の DB row / public row 型境界
- `apps/product/src/features/timeblock/server/statistics-service.ts` の TypeScript statistics orchestration
- `apps/product/src/features/timeblock/server/statistics-service-grouping.ts` の hour / day grouping
- `scripts/parse-filename.ts` と `scripts/eagle-sync.ts` の feature taxonomy
- `.claude/skills/supabase/SKILL.md` の destructive change 3段階フロー

## What I'm Not Doing

- Chronotype の代替となる集中時間帯 feature は設計しない
- FulfillmentScore の別指標への置き換えや既存値の移行は行わない
- Phase 1 と DB column drop を同じ PR にまとめない
- historical migration / frozen log / 完了済み Project を現在形へ書き換えない
- 一般的な productivity 記事から `chronotype` という概念自体を削除しない
