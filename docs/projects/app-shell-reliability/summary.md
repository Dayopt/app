---
status: current
last_verified: 2026-08-09
code: apps/product/src/app/[locale]/(app)/_shell
---

# app-shell-reliability 完了サマリー

default locale の prefix なし URL と自前ヘッダ画面を shell の通常経路へ揃え、英語 Calendar のヘッダ重複、mobile 設定導線の locale 変更、`past_due` 常設バナーの欠落を解消した。

## 完了した契約

- shell の route 判定は `@dayopt/i18n/navigation` の locale-free pathname を使い、URL segment を locale として手動解釈しない
- mobile 設定 URL は現在 locale を保ち、locale-free pathname と query を `returnTo` に一度だけ encode する
- `InlineBanner` は shell が所有して全 app 画面で一度だけ描画し、`hasOwnHeader` は AppHeader の重複防止だけに使う
- `MobileAccountButton` の presentation API、billing 状態判定、公開 URL、server / client 境界は変更しない

## 検証

- shell layout と mobile account URL の unit test
- prefix なし英語 Calendar の認証済み E2E
- past_due の desktop Calendar、mobile Calendar、mobile settings Story
- `pnpm check`
- `pnpm lint:boundaries`
- `pnpm build`
- `pnpm build-storybook`
- Storybook 実画面（desktop Calendar / mobile Calendar / mobile settings）で banner 1件、header 1件、console error 0件、横 overflow 0件

詳細な設計と対象外は [overview](./overview.md) を参照する。
