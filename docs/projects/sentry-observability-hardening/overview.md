---
status: active
last_verified: 2026-07-16
code:
  - packages/observability
  - apps/product
  - apps/web
  - docs/operations/monitoring.md
---

# sentry-observability-hardening — 障害監視の信頼性とデータ境界を修復する

Product と Web の Sentry を別 project で運用し、予期しない障害だけを、壊れていない trace と最小限の技術情報で追跡できる状態へ揃える。

## Goal

- error / transaction / span / breadcrumb が同じ privacy contract に従い、Sentry protocol ID を壊さない
- Product と Web の runtime、release、source map、alert、quota を分離し、Production だけを観測する
- server / edge は常時、browser telemetry は analytics 同意後だけ送信する
- expected error と正常系 telemetry を Issues から除外し、unexpected error を元 stack 付きで一度だけ capture する
- local checks と制御された Production smoke で受信、symbolication、trace、alert を実証する

## Delivery

1. app 横断の sanitizer、technical context、browser telemetry consent を `@dayopt/observability` に集約する
2. Product の PII scrub、error capture、Supabase integration、Web Vitals、CSP、SDK/build 設定を修正する
3. Web に独立した Sentry runtime/build integration と同意連動 UI を追加する
4. Vercel/Sentry organization/project 設定、運用文書、GitHub issue の現在値を同期する
5. Preview と local validation を通し、短命な operator-only smoke surface で Production 証跡を取得後に撤去する

## Acceptance Criteria

- event / trace / span ID を保持し、message、compound secret、URL query、深い object、contact 本文を送信しない
- expected auth / validation / not-found / conflict は Issue を作らず、unexpected error は同一原因につき一度だけ送信する
- Product / Web の browser SDK、Analytics、Speed Insights は未同意・拒否時に起動せず、同意後に一度だけ起動する。Session Replay は URL query 非送信を保証できる方式がないため起動しない
- Product / Web は別 Sentry project を使い、Preview / CI は release と source map を作成しない
- Production test event が commit SHA release と元 TypeScript 行へ解決され、trace、alert、PII 不在を確認できる
- `pnpm test:run`、`pnpm typecheck`、`pnpm lint`、`pnpm lint:boundaries`、`pnpm lint:i18n`、`pnpm check`、`pnpm docs:check` が通る

## Reversibility

- shared package、SDK hooks、Web integration、同意 UI は commit revert で戻せる
- Sentry/Vercel project 設定は変更前の値を記録してから適用し、project 単位で復元できる
- Production smoke surface と一時 secret は検証直後に削除し、永続 API として残さない

## Out of Scope

- Profiling、Preview observability、Sentry tunnel の再導入
- URL queryを送らないことを実証できるSession Replayの再導入
- Low-Value Spans の最適化（#1599 の後続作業）
- `status:blocked` の #1558 を解除して行う 1Password 全体 cleanup

## Related Issues

- [#1566 Sentry 運用整備](https://github.com/Dayopt/dayopt/issues/1566)
- [#1599 Low-Value Spans 最適化](https://github.com/Dayopt/dayopt/issues/1599)
- [#1558 Vercel Sensitive Environment Variable 監査](https://github.com/Dayopt/dayopt/issues/1558)
