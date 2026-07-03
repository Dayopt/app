---
status: current
last_verified: 2026-07-02
---

# 契約サービス一覧

Dayopt が依存する外部サービスの一覧。新しいサービスを追加したら行を1つ足す。解約・移行したら行を消さず「解約済み」の note を残すか `docs/{domain}/log/YYYY-MM-DD-slug.md` に経緯を書いて `superseded_by` で辿れるようにする。

料金の詳細な試算は [business/business-model.md](../business/business-model.md) を参照。このファイルは「何を・なぜ使っているか」の索引であり、金額の正本ではない。

| サービス                 | 用途                                                 | プラン                             | 主要な上限                                         | 月額（目安）                      | 契約・解約条件                                         | 選定理由                                                                                                                                 | 最終確認日 |
| ------------------------ | ---------------------------------------------------- | ---------------------------------- | -------------------------------------------------- | --------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Vercel**               | ホスティング、Serverless実行、Analytics              | Pro ($20/月)                       | 帯域幅100GB込み、Serverless Compute従量課金        | $25〜$405（規模依存）             | 月次サブスク、いつでも解約可                           | Next.jsとの統合最適化、自動デプロイ、エッジ配信。[business-model.md](../business/business-model.md#vercel-内訳pro-plan-20月-ベース)      | 2026-07-02 |
| **Supabase**             | PostgreSQL DB、Auth、Storage、Realtime基盤           | Pro (production) + Staging project | DB容量・行数・APIリクエスト数（プラン依存）        | $0〜$130（規模依存）+ Staging $25 | 月次サブスク                                           | フルマネージドPostgreSQL、RLSによるDBレベル認可、Auth統合。[business-model.md](../business/business-model.md#supabase-内訳)              | 2026-07-02 |
| **Anthropic (Claude)**   | Pro プランのAI機能（BYOK）                           | BYOK（ユーザー自己負担）           | ユーザー自身のAPIキー上限に依存                    | $0（Dayopt負担なし）              | ユーザーがAnthropicと直接契約                          | 観察者型AI insightsのコアモデル。BYOKによりDayoptのAIコストを構造的に排除。[product/specs/billing.md](../product/specs/billing.md)       | 2026-07-02 |
| **OpenAI (GPT-4o-mini)** | 14日間Proトライアル中のAI機能                        | 従量課金                           | トライアルユーザー数 × 使用量                      | ~$0.1〜$0.2（規模依存）           | 従量課金、契約なし                                     | トライアル体験のフル開放用。低コストモデルでトライアルAIコストを最小化。[business-model.md](../business/business-model.md#ai-コスト構造) | 2026-07-02 |
| **Sentry**               | エラー監視、パフォーマンス監視                       | Developer ($0) → Team ($29/月)     | エラーイベント数、トランザクション数（プラン依存） | $0 → $29                          | 月次サブスク。ユーザー増加後にTeamへ移行予定           | エラー・パフォーマンスの一元監視。[operations/monitoring.md](../operations/monitoring.md)                                                | 2026-07-02 |
| **Upstash (Redis)**      | レート制限（6バケット）                              | 従量課金                           | リクエスト数課金                                   | ~$6                               | 従量課金、契約なし。障害時はインメモリにフォールバック | サーバーレス環境向けの低コストRedis。                                                                                                    | 2026-07-02 |
| **Stripe**               | サブスクリプション課金（Checkout/Portal/Webhook）    | 従量課金（決済手数料）             | 決済手数料 3.6% + ¥40/件                           | 規模連動（~$2〜$90）              | 従量課金、契約なし                                     | 業界標準の決済基盤。Customer Portalでセルフサーブ解約を実現。[product/specs/billing.md](../product/specs/billing.md)                     | 2026-07-02 |
| **Resend**               | トランザクションメール送信                           | 従量課金                           | 送信数課金（無料枠あり）                           | $0〜$20（規模依存）               | 従量課金、契約なし                                     | シンプルなAPIとNext.js親和性。                                                                                                           | 2026-07-02 |
| **GitHub**               | リポジトリホスティング、Actions CI/CD                | Free                               | Actions 2,000分/月無料枠                           | $0                                | 無料プラン                                             | 標準的な開発基盤。7 workflow、~300-400分/月で無料枠内。                                                                                  | 2026-07-02 |
| **Cloudflare Turnstile** | Bot対策（CAPTCHA代替）                               | Free                               | —                                                  | $0                                | 無料プラン                                             | プライバシー重視のBot対策。[engineering/infra.md](../engineering/infra.md)                                                               | 2026-07-02 |
| **1Password**            | シークレット管理（`op run` 経由でCI/ローカルに注入） | チーム/Business プラン             | —                                                  | （組織契約に含む）                | —                                                      | env値をリポジトリに置かず一元管理。MCP認証にも使用。[MCP利用ガイド](../../.claude/rules/mcp-usage.md)                                    | 2026-07-02 |
| **Slack**                | 課金イベント等の通知（Webhook）                      | 既存ワークスペース利用             | —                                                  | $0                                | —                                                      | 既存インフラの再利用。                                                                                                                   | 2026-07-02 |
| **ドメインレジストラ**   | `dayopt.app` ドメイン                                | 年払い                             | —                                                  | ~$1（年$12）                      | 年次更新                                               | —                                                                                                                                        | 2026-07-02 |

## 記載していないもの

- OSSライブラリ（Next.js, React, tRPC, Zustand, Zod, shadcn/ui 等）— [engineering/architecture.md](../engineering/architecture.md) を参照。SaaS依存のみここに載せる
- Context7 / Storybook MCP 等の開発時のみ使うMCPサーバー — 稼働中プロダクトへの依存ではないため対象外
