# Docs Map

Dayopt の docs 全体の地図。「何を知りたいとき、どこを見るか」の逆引きガイド。AI（Claude Code / Codex）がファイル検索する前の参照ポイントとしても機能する。

## ディレクトリ構成

```
docs/
├── README.md                  # このファイル（地図）
├── product/                   # プロダクト全体像、ロードマップ
├── architecture/              # 技術アーキテクチャ（ストック）
│   ├── api/                   # tRPC / API 契約 / 型生成
│   ├── frontend/              # ルーティング、状態管理、hooks、a11y、PWA
│   ├── data/                  # DB スキーマ
│   ├── platform/              # 環境構成、bot 対策、開発ツール
│   ├── conventions/           # コード規約、設計パターン、タイムゾーン
│   └── adr/                   # Architecture Decision Records
├── operations/                # 運用（監視、リリース、セキュリティ）
│   ├── monitoring/            # Sentry、bundle、performance 監視
│   ├── releases/              # リリース手順
│   └── security/              # セキュリティ運用
├── business/                  # 事業（brand、marketing、sns、競合）
│   ├── brand/
│   ├── marketing/
│   └── sns/
├── guides/                    # 手順書、ハマりどころ、チェックリスト
├── decisions/                 # プロダクト判断の ADR（001〜）
├── glossary/                  # 用語集、禁止語
├── notes/                     # 時点ものの調査・監査ログ（日付プレフィックス）
├── journal/                   # 開発ジャーナル（月次）
├── sessions/                  # セッション記録（日次、latest.md は上書き可）
├── projects/                  # 進行中プロジェクトの設計書（README.md が索引）
└── archive/                   # 完了・停止した projects、時点ものの旧監査
```

## ディレクトリマップ（アプリケーションコード）

```
apps/product/src/
├── app/[locale]/              # Next.js App Router（ページ = Composition Layer）
│   ├── (app)/                 # 認証済みユーザー向けレイアウト
│   │   ├── calendar/          # カレンダーページ（day/week/nday）
│   │   ├── stats/             # 統計ページ（insights/progress/tags）
│   │   ├── settings/          # 設定ページ
│   │   └── notifications/     # 通知ページ
│   └── (marketing)/           # 未認証ユーザー向け（LP、ログイン）
│
├── features/                  # Feature モジュール（DAG階層）
│   ├── tags/                  # Layer 0: タグ管理
│   ├── chronotype/            # Layer 0: クロノタイプ
│   ├── entry/                 # Layer 1: エントリ（時間ブロック）
│   ├── calendar/              # Layer 2: カレンダー表示
│   ├── stats/                 # Layer 2: 統計・分析
│   ├── history/               # Layer 2: 最近のブロック
│   ├── palette/                # Layer 2: クイック挿入
│   ├── auth/                  # Cross-cutting: 認証
│   ├── settings/              # Cross-cutting: ユーザー設定
│   ├── notifications/         # Cross-cutting: 通知
│   ├── onboarding/            # Independent: 初回案内
│   ├── tour/                  # Independent: 機能紹介
│   ├── contact/               # Independent: フィードバック
│   └── ai/                    # Independent: AI機能
│
├── components/
│   ├── ui/                    # shadcn/ui ベースの Primitive コンポーネント
│   └── common/                # アプリ共通の複合コンポーネント
│
├── shell/components/          # アプリシェル（Header, Sidebar, BottomTab）
│
├── platform/                  # インフラ層（フレームワーク依存）
│   ├── trpc/                  # tRPC クライアント設定
│   ├── auth/                  # Supabase Auth ヘルパー
│   ├── supabase/              # Supabase クライアント
│   ├── i18n/                  # next-intl 設定
│   ├── stripe/                # Stripe 決済
│   ├── sentry/                # エラー監視
│   ├── analytics/             # イベント追跡
│   ├── cache/                 # TanStack Query キャッシュ設定
│   └── security/              # CSP, CSRF
│
├── stores/                    # グローバル Zustand ストア
├── hooks/                     # 共有カスタムフック
├── types/                     # 共有型定義
├── lib/                       # ユーティリティ（日付、セキュリティ、PWA等）
├── lib/styles/tokens/         # product 固有 / legacy token layer
│
├── stories/
│   ├── patterns/              # 実装パターン Story
│   └── docs/                  # ドキュメント MDX
│
└── emails/                    # メールテンプレート

packages/
├── design/                    # design token source of truth
├── ui/                        # domain logic を持たない React UI
├── config/                    # URL / domain / contact / public constants
├── domain/                    # DB に依存しない Dayopt domain model
├── database/                  # Supabase generated types / converters
├── billing/                   # plans / subscription / entitlement
└── utils/                     # generic pure utilities
```

責務境界の詳細は [Architecture Overview](architecture/overview.md) を参照。

## Root commands

root の `dev`, `build`, `start` は既存互換のため product app の alias として残す。monorepo の対象を明示したいときは下の command を使う。

| やりたいこと                 | コマンド                  |
| ---------------------------- | ------------------------- |
| product を起動               | `pnpm dev:product`        |
| product を build             | `pnpm build:product`      |
| web を build                 | `pnpm build:web`          |
| Storybook を build           | `pnpm build-storybook`    |
| shared packages を build     | `pnpm build:packages`     |
| shared packages を型チェック | `pnpm typecheck:packages` |
| workspace smoke check        | `pnpm check:workspace`    |

## 目的別ガイド

### UI を変更したい

| やりたいこと             | 探す場所                  | 例                                    |
| ------------------------ | ------------------------- | ------------------------------------- |
| ボタン・入力欄を変更     | `src/components/ui/`      | `button.tsx`, `input.tsx`             |
| 共通UIを変更             | `src/components/common/`  | `EmptyState.tsx`, `DateNavigator.tsx` |
| ヘッダー・サイドバー変更 | `src/shell/components/`   | `AppHeader.tsx`, `sidebar/`           |
| デザイントークン変更     | `packages/design/src/`    | `colors.ts`, `theme.css`              |
| アイコン確認             | `Foundations/Icons` Story | lucide-react 一覧                     |

### Feature を変更したい

| やりたいこと             | 探す場所                          | 補足                         |
| ------------------------ | --------------------------------- | ---------------------------- |
| Feature のコンポーネント | `src/features/{name}/components/` | —                            |
| Feature のAPI（tRPC）    | `src/features/{name}/server/`     | `router.ts` + `*-service.ts` |
| Feature のフック         | `src/features/{name}/hooks/`      | barrel export のみ外部使用可 |
| Feature のストア         | `src/features/{name}/stores/`     | —                            |
| Feature の型             | `src/features/{name}/types/`      | —                            |
| Feature の公開API確認    | `src/features/{name}/index.ts`    | これ以外は import 禁止       |

### API を変更したい

| やりたいこと         | 探す場所                                                    | 補足                                     |
| -------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| tRPC ルーター追加    | `src/features/{name}/server/router.ts`                      | 3層パターン: Router → Service → Supabase |
| サービスロジック     | `src/features/{name}/server/{name}-service.ts`              | ビジネスロジックはここ                   |
| Supabase 型確認      | `apps/product/src/lib/database/generated/database.types.ts` | `pnpm types:generate` で再生成           |
| マイグレーション作成 | `supabase/migrations/`                                      | `pnpm migration:create`                  |
| RLS ポリシー確認     | `supabase/migrations/`                                      | `_rls` suffix のマイグレーション         |

### 国際化（i18n）

| やりたいこと   | 探す場所                                        |
| -------------- | ----------------------------------------------- |
| 翻訳キー追加   | `messages/ja/*.json` + `messages/en/*.json`     |
| i18n 設定      | `src/platform/i18n/`                            |
| フック使用     | `useTranslations('namespace')` from `next-intl` |
| 整合性チェック | `pnpm lint:i18n`                                |

### テスト

| やりたいこと             | コマンド                                |
| ------------------------ | --------------------------------------- |
| ユニットテスト実行       | `pnpm test:run`                         |
| テスト（ウォッチモード） | `pnpm test`                             |
| 統合テスト               | `pnpm test:integration`                 |
| E2E スモーク             | `pnpm test:e2e:smoke`                   |
| Storybook play関数テスト | `pnpm storybook` → `test-runner`        |
| テストファイル配置       | テスト対象ファイルの隣に `*.test.ts(x)` |

### 品質チェック

| やりたいこと         | コマンド                |
| -------------------- | ----------------------- |
| 型チェック           | `pnpm typecheck`        |
| Lint                 | `pnpm lint`             |
| Feature 境界チェック | `pnpm lint:boundaries`  |
| デザイントークン検証 | `pnpm lint:tokens`      |
| 未使用コード検出     | `pnpm quality:deadcode` |

## Feature 内のファイル構成

```
src/features/{name}/
├── index.ts                   # Barrel export（公開API）
├── components/                # UI コンポーネント
│   ├── {Component}.tsx
│   ├── {Component}.stories.tsx
│   ├── {Component}.docs.mdx   # (optional)
│   └── story-helpers.tsx       # (optional) Story用モック
├── hooks/                     # カスタムフック
├── server/                    # tRPC ルーター + サービス
│   ├── router.ts
│   ├── {name}-service.ts
│   └── __tests__/
├── stores/                    # Zustand ストア (optional)
├── types/                     # 型定義
└── lib/                       # ユーティリティ (optional)
```

## 主要ドキュメント一覧

| ドキュメント                                      | 内容                                     |
| ------------------------------------------------- | ---------------------------------------- |
| [Architecture Overview](architecture/overview.md) | モノレポ全体像、packages 責務境界        |
| [Product Overview](product/overview.md)           | Dayopt の全体像                          |
| [Data Flow](architecture/data-flow.md)            | データの流れ                             |
| [Tech Stack](architecture/tech-stack.md)          | 技術スタック                             |
| [Commands](guides/commands.md)                    | 全コマンド一覧                           |
| [Common Pitfalls](guides/common-pitfalls.md)      | よくある間違い                           |
| [ADR Index](architecture/adr/index.md)            | 技術判断の Architecture Decision Records |
| [Decisions](decisions/)                           | プロダクト判断の意思決定記録             |
| [Glossary](glossary/terms.md)                     | 用語集・禁止語                           |
| [Projects](projects/README.md)                    | 進行中プロジェクトの索引                 |
