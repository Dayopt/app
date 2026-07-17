---
status: frozen
date: 2026-07-16
code:
  - packages/observability
  - apps/product/instrumentation.ts
  - apps/web/src/instrumentation.ts
---

# Sentryのserver監視とbrowser telemetryで同意境界を分ける

## 背景・当時の前提

2026-02-18の判断では、Sentryの本番利用全体をCookie同意後に有効化するものとして扱っていた。その後の実装ではbrowserだけが同意連動となり、server / edgeはproductionで常時初期化されていた。文書と実装の境界が一致せず、同意前に起きたserver障害を観測できるかも不明確だった。

## 決定と理由

- Product / Webのserver / edge error監視は、Productionに限って常時有効にする
- browser SDK、Vercel Analytics、Speed Insightsはanalytics同意後だけ有効にする
- browser telemetryの同意撤回時は送信を即時無効化してページを再読込し、SDK integrationとscopeを未初期化状態へ戻す
- Session Replayは、SDKがURL queryをRRWeb metadataとReplay envelopeへ直接含め、通常のsanitizerでは除去できないため無効化する
- server eventには内部user IDと必要最小限の技術情報だけを含め、request body、cookie、authorization、email、user content、URL queryを送らない
- ProductとWebは別Sentry projectで運用し、Preview / CI / Developmentではruntime送信もsource map uploadも行わない

server監視は障害対応とサービス保全に必要で、ブラウザ保存領域や行動計測を必要としない。一方、browser telemetryは端末上の利用状況を扱うため、従来どおりanalytics同意の対象とする。Replayはtext maskとmedia blockだけではURL queryや認証コードの非送信を保証できないため、安全に再導入できるまで送信しない。

## 却下した選択肢と、なぜ捨てたか

- Sentry全体を同意後だけ有効化する案は、同意前に発生したserver / edge障害を観測できないため採用しない
- browser telemetryも常時有効にする案は、2026-02-18に決めた安全側の同意方針と一致しないため採用しない
- PreviewでもSentryを有効にする案は、productionのIssue、release、quotaを開発ノイズから分離できなくなるため採用しない
- 現行SDKのReplayをmask設定だけで使う案は、raw URLをsanitizer callbackの外で送るため採用しない

## 影響・やること

- 共通sanitizerと同意判定を`packages/observability`へ集約する
- Product / Webのruntime config、privacy / cookie文書、monitoring runbookをこの境界へ揃える
- Sentry / Vercel envは各projectのProduction targetだけに置く
- 2026-02-18のCookie同意バナー導入判断は維持し、本ログでSentry runtimeの適用範囲だけを具体化する

## 関連

- `docs/operations/log/2026-02-18-cookie-consent-required.md`
- `docs/operations/log/2026-07-14-vercel-env-scope-audit.md`（SentryのPreview credential判断を本ログで変更）
- `docs/operations/monitoring.md`
- `docs/operations/secrets.md`
