---
status: current
last_verified: 2026-07-21
code:
  - apps/web/content
  - apps/web/src/app/[locale]/(marketing)/legal
  - apps/web/src/platform
  - apps/web/src/lib
---

# web-content-platform-refactor 完了サマリー

GitHub issue #1534・#1535 を1ブランチ・1 PRで実装し、法務文書のcontent ownershipとWeb内部の共通モジュール責務を整理した。公開URL、文面、metadata、主要link、responsive layoutは維持している。

## 完了した契約

- SEOとenvを責務別moduleへ分割し、既存の`@/platform/seo/metadata`と`@/platform/config/env`はnamed re-export facadeとして維持した。
- Web固有のerror処理、class name結合、読了時間計算を責務名pathへ移し、未使用helperと曖昧な`error-utils.ts` / `utils.ts`を削除した。
- en / jaのprivacy、terms、cookies、tokushoho、securityをstrict frontmatter付きMDXへ移し、route-private loaderとlegal専用rendererを追加した。
- 連絡先は`@dayopt/config`から注入し、legal contentには固定値を複製していない。
- securityを含む法務10 URLは、1日revalidationのSSGとして生成する。

## 検証

- Web lint / typecheck / 34 files・181 unit tests / 109-page buildを通過した。
- 法務E2Eはdevelopmentとproductionの両方で14/14 testsを通過した。
- 最新`origin/main`との本文hashは10/10一致した。desktop 10枚と390px 6枚の比較でサイズ・配置差はなく、pixel差は文字antialiasのみ（最大0.0018%）だった。
- root typecheck / lint / boundaries / dead-code / `pnpm check` / E2E smokeと、content / i18n / docs validationを通過した。

詳細な設計、可逆性、deferred scopeは[overview](./overview.md)を参照する。
