---
status: current
last_verified: 2026-07-14
---

# 契約サービス一覧

Dayopt が依存する外部サービスの一覧。新しいサービスを追加したら行を1つ足す。解約・移行したら行を消さず「解約済み」の note を残すか `docs/{domain}/log/YYYY-MM-DD-slug.md` に経緯を書いて `superseded_by` で辿れるようにする。

料金の詳細な試算は [business/business-model.md](../business/business-model.md) を参照。このファイルは「何を・なぜ使っているか」の索引であり、金額の正本ではない。

| サービス                 | 用途                                                 | プラン                              | 主要な上限                                         | 月額（目安）                      | 契約・解約条件                                         | 選定理由                                                                                                                                                                    | 最終確認日 |
| ------------------------ | ---------------------------------------------------- | ----------------------------------- | -------------------------------------------------- | --------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Vercel**               | ホスティング、Serverless実行、Analytics              | Hobby（現在）→ Pro（拡張時）        | Deployment Policies は Pro / Enterprise のみ       | $0（現在）→ $25〜$405（規模依存） | Hobbyは無料。Proは月次、いつでも解約可                 | Next.js統合と自動デプロイ。Pro移行後はGitHub-only policyを適用する。[判断ログ](../engineering/log/2026-07-14-vercel-github-only-deployment-policy.md)                       | 2026-07-14 |
| **Supabase**             | PostgreSQL DB、Auth、Storage、Realtime基盤           | Pro organization / `dayopt` project | DB容量・行数・APIリクエスト数（プラン依存）        | $0〜$130（規模依存）              | 月次サブスク                                           | 本番は単一 project、PR 検証は ephemeral Preview Branches。永続 Staging project は置かない。[business-model.md](../business/business-model.md#supabase-内訳)                 | 2026-07-14 |
| **Sentry**               | エラー監視、パフォーマンス監視                       | Developer ($0) → Team ($29/月)      | エラーイベント数、トランザクション数（プラン依存） | $0 → $29                          | 月次サブスク。ユーザー増加後にTeamへ移行予定           | エラー・パフォーマンスの一元監視。[operations/monitoring.md](../operations/monitoring.md)                                                                                   | 2026-07-02 |
| **Upstash (Redis)**      | レート制限（6バケット）                              | 従量課金                            | リクエスト数課金                                   | ~$6                               | 従量課金、契約なし。障害時はインメモリにフォールバック | サーバーレス環境向けの低コストRedis。                                                                                                                                       | 2026-07-02 |
| **Stripe**               | サブスクリプション課金（Checkout/Portal/Webhook）    | 従量課金（決済手数料）              | 決済手数料 3.6% + ¥40/件                           | 規模連動（~$2〜$90）              | 従量課金、契約なし                                     | 業界標準の決済基盤。Customer Portalでセルフサーブ解約を実現。[product/specs/billing.md](../product/specs/billing.md)                                                        | 2026-07-02 |
| **Resend**               | トランザクションメール送信                           | 従量課金                            | 送信数課金（無料枠あり）                           | $0〜$20（規模依存）               | 従量課金、契約なし                                     | 直接連携を維持。Vercel Marketplace は使わず、API key は1Password master / Vercel replicaで管理。[判断ログ](../engineering/log/2026-07-14-keep-direct-resend-integration.md) | 2026-07-14 |
| **GitHub**               | リポジトリホスティング、Actions CI/CD                | Free                                | Actions 2,000分/月無料枠                           | $0                                | 無料プラン                                             | 標準的な開発基盤。7 workflow、~300-400分/月で無料枠内。                                                                                                                     | 2026-07-02 |
| **Cloudflare Turnstile** | Bot対策（CAPTCHA代替）                               | Free                                | —                                                  | $0                                | 無料プラン                                             | プライバシー重視のBot対策。[engineering/infra.md](../engineering/infra.md)                                                                                                  | 2026-07-02 |
| **1Password**            | シークレット管理（`op run` 経由でCI/ローカルに注入） | チーム/Business プラン              | —                                                  | （組織契約に含む）                | —                                                      | env値をリポジトリに置かず一元管理。MCP認証にも使用。[MCP利用ガイド](../../.claude/rules/mcp-usage.md)                                                                       | 2026-07-02 |
| **Slack**                | 課金イベント等の通知（Webhook）                      | 既存ワークスペース利用              | —                                                  | $0                                | —                                                      | 既存インフラの再利用。                                                                                                                                                      | 2026-07-02 |
| **ドメインレジストラ**   | `dayopt.app` ドメイン                                | 年払い                              | —                                                  | ~$1（年$12）                      | 年次更新                                               | —                                                                                                                                                                           | 2026-07-02 |

## 記載していないもの

- OSSライブラリ（Next.js, React, tRPC, Zustand, Zod, shadcn/ui 等）— [engineering/architecture.md](../engineering/architecture.md) を参照。SaaS依存のみここに載せる
- Context7 / Storybook MCP 等の開発時のみ使うMCPサーバー — 稼働中プロダクトへの依存ではないため対象外
- Anthropic / OpenAI — in-app AI は提供せず、外部 AI 連携はユーザー側の MCP / API client が担うためランタイム依存に含めない
