---
status: done
last_verified: 2026-08-09
code: apps/product/src/app/[locale]/(app)/_shell
---

# app-shell-reliability — locale と常設バナーの経路を揃える

GitHub issue #1838 / #1874 の実装設計。default locale の prefix なし URL と自前ヘッダ画面を app shell の通常経路として扱い、ヘッダ・設定導線・決済失敗バナーの欠落を防ぐ。

## Goal

- 英語の `/day` でも Calendar 固有ヘッダだけを表示する
- mobile の設定導線で現在 locale、pathname、query を保持する
- `past_due` の常設バナーを Calendar と mobile settings を含む全 app 画面で一度だけ表示する

## Minimum Viable Approach

1. shell の route 判定は `@dayopt/i18n/navigation` の locale-free `usePathname` に統一し、pathname 先頭 segment の手動 locale 判定を削除する。
2. mobile の設定 URL は `useLocale` と `getPathname` で生成し、locale-free pathname と query を既存の `returnTo` へ一度だけ encode する。
3. `InlineBanner` は shell が常に所有し、通常画面では AppHeader の後、自前ヘッダ画面では main の前に置く。`hasOwnHeader` は AppHeader の重複防止だけに使う。

## Acceptance Criteria

- `/day` と `/ja/day` で shell AppHeader が重複しない
- EN / JA の設定 URL が現在 locale と query を保ち、`returnTo` を二重 encode しない
- desktop / mobile の Calendar、mobile settings、通常画面で `past_due` バナーが一度だけ表示される
- `past_due` でない場合はアクセシブルな alert が表示されない
- shell unit test、認証済み Calendar E2E、Storybook の desktop / mobile fixture、repository quality gate が通る

## Reversibility Table

| 変更                | 可逆性      | 根拠                                        |
| ------------------- | ----------- | ------------------------------------------- |
| route / locale 判定 | `[minutes]` | client shell 内部の配線だけで revert できる |
| banner 配置         | `[minutes]` | billing 判定や feature API を変えない       |
| test / Story / docs | `[minutes]` | repo 内の検証資産だけ                       |

DB、公開 API、schema、翻訳キー、canonical URL の変更はない。

## Existing Code to Reuse

- `@dayopt/i18n/navigation` の `usePathname` / `getPathname`
- `next-intl` の `useLocale`
- `isCalendarViewPath`、`useAppInlineBanner`、`InlineBanner`
- `MobileAccountButton` の既存 presentation API と settings の `returnTo` 契約

## What I'm Not Doing

- app 全体の locale / return URL 処理の包括的 refactor
- `CalendarLayout` や settings feature への banner prop / context 配線
- billing / Stripe 状態判定、`useAppInlineBanner` の返り値、UI 文言の変更
- 未参照の `common.inlineBanner` 翻訳キー整理
