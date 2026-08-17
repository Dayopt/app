---
status: current
last_verified: 2026-08-12
---

# 規約・ポリシーの所在

Legal（利用規約・プライバシーポリシー等）の実体パスと改定記録の運用ルール。現行版の本文は複製しない。

## 現行版の参照先

現行版の本文は **アプリ内（`apps/web`）が正本**。ここでは複製せず、参照先と改定の記録場所だけを示す。

| 文書                     | 実装パス                                                   | i18n messages                                         |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------- |
| 利用規約                 | `apps/web/src/app/[locale]/(marketing)/legal/terms/`       | `apps/web/messages/{ja,en}/legal.json`                |
| プライバシーポリシー     | `apps/web/src/app/[locale]/(marketing)/legal/privacy/`     | `apps/web/messages/{ja,en}/legal.json`                |
| Cookie ポリシー          | `apps/web/src/app/[locale]/(marketing)/legal/cookies/`     | `apps/web/messages/{ja,en}/legal.json`                |
| 返金ポリシー             | `apps/web/src/app/[locale]/(marketing)/legal/refund/`      | `apps/web/messages/{ja,en}/legal.json`                |
| 特定商取引法に基づく表記 | `apps/web/src/app/[locale]/(marketing)/legal/tokushoho/`   | `apps/web/messages/{ja,en}/legal.json`                |
| セキュリティ             | `apps/web/src/app/[locale]/(marketing)/legal/security/`    | `apps/web/messages/{ja,en}/legal.json`                |
| OSS クレジット           | `apps/web/src/app/[locale]/(marketing)/legal/oss-credits/` | 生成物（`pnpm generate-licenses` 相当）。手書きしない |

## 改定の記録

利用規約・プライバシーポリシー等を改定したら、**なぜ改定したか**を `/decision` で記録する（本文の diff は git history が正本、decision には理由だけ書く）。

例: [ADR-008 cookie consent banner](./log/2026-02-16-cookie-consent-banner.md)、[ADR-009 cookie consent required](./log/2026-02-18-cookie-consent-required.md) は過去の cookie 同意まわりの意思決定記録（このディレクトリ新設以前のもの）。[2026-08-12 privacy Google Calendar 節追加](./log/2026-08-12-privacy-google-calendar-section.md) は GCP sensitive scope 審査（#1963）に向けた最新例。[2026-08-17 Axiom サブプロセッサー追記](./log/2026-08-17-axiom-subprocessor-notice.md) は Vercel Log Drains 導入（#1701 Phase 3）の legal 前提（30 日前通知）に向けた例。

## このファイルに書かないこと

- 規約・ポリシーの本文コピー（アプリ側と二重管理になり drift する）
- 改定履歴の詳細diff（git log で追える）
