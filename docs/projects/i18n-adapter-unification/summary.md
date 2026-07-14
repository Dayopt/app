---
status: current
last_verified: 2026-07-14
code: packages/i18n
---

# i18n-adapter-unification 完了サマリー

productとwebに重複していたnext-intl adapterを`@dayopt/i18n`へ集約し、locale定数、navigation、request locale fallbackを共有した。

## 完了した契約

- locale一覧とdefault localeは`@dayopt/config`が正本
- framework adapterは`@dayopt/i18n/{routing,navigation,request}`のsubpath exportで公開
- product / web固有のmessage discoveryとerror reportingは各appに残す
- app-local routing / navigation shimは削除し、consumerは共有packageを直接importする
- valid / missing / invalid localeと両appのlocale smoke testを追加した

## 実装

- implementation: `0f9bc2c60` (`refactor: i18n基盤を共有パッケージへ集約`)
- verification: `bf6fa632e` (`test: 両アプリのロケールスモークを追加`)

詳細な設計と公開interfaceは[overview](./overview.md)を参照する。
