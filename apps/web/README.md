# Dayopt マーケティングウェブサイト

> `apps/web` は dayopt.app の公開マーケティングサイトを管理する。
> 既存独立 repo (`dayopt-marketing`) から monorepo 化により取り込まれた。
> 以下の README 本文は旧 repo 由来の説明をそのまま保持しており、コマンド例の `npm run X` は monorepo 内では `pnpm X` または root から `pnpm --filter @dayopt/web X` に読み替えること。Vercel Project 分離・docs 整備は follow-up PR で実施予定。

Next.js 16で構築された、モダンで高パフォーマンスなマーケティングウェブサイトです。包括的なアクセシビリティ対応（WCAG 2.1 AA準拠）、高度なパフォーマンス最適化、エンタープライズレベルのセキュリティを実現しています。

## 主な機能

### コア機能

- **Next.js 16**: App RouterとServer Componentsを採用
- **TypeScript**: 型安全性と開発体験の向上
- **Tailwind CSS v4**: ユーティリティファーストのスタイリング
- **shadcn/ui**: 高品質なUIコンポーネント
- **MDX**: Reactコンポーネントを含むリッチコンテンツ
- **多言語対応**: next-intlによる英語・日本語の完全サポート
  - Web版専用の最適化された翻訳ファイル（267行）
  - 検索履歴の localStorage 対応

### パフォーマンス最適化

- **Core Web Vitals**: リアルタイム監視と最適化（目標: 90+）
- **動的インポート**: コード分割による最適化
- **画像最適化**: レスポンシブサイズとWebP/AVIF対応
- **フォント最適化**: クリティカルなフォントのプリロード
- **バンドル分析**: サイズ最適化の自動分析
- **Service Worker**: オフライン対応
- **React最適化**:
  - useMemo によるメモ化（タグフィルタリング、クイックリンク生成）
  - メモリリーク対策（AbortController による fetch キャンセル）
  - 型安全性強化（API レスポンス型定義）

### アクセシビリティ（WCAG 2.1 AA準拠）

- **適切なalt属性**: コンテキストを考慮した自動生成
- **フォーカス管理**: トラップと復元機能
- **色コントラスト検証**: リアルタイムチェック
- **スクリーンリーダー対応**: 包括的なARIAラベル
- **キーボードナビゲーション**: 完全な方向キー対応
- **モーション設定の尊重**: ユーザー設定に配慮

### セキュリティ機能

- **Content Security Policy (CSP)**: 厳格なヘッダー設定
- **入力検証**: サニタイゼーション処理
- **XSS対策**: HTMLエスケープ処理
- **CSRF対策**: Origin/Referer ヘッダー検証（全APIルート）
- **レート制限**: IP ベースの制限（@upstash/ratelimit）
  - コンタクトフォーム: 5分間に3回
  - 検索API: 1分間に30回
  - タグAPI: 1分間に60回
- **DoS 攻撃対策**: タイムアウト設定と長さ制限
- **個人情報保護**: メールアドレスのマスキングとGDPR準拠
- **セキュリティヘッダー**: HSTS, X-Frame-Options, X-Content-Type-Options
- **環境変数の型安全性**: 実行時バリデーションと型定義（13種類の環境変数）

### 開発体験（DX）

- **型安全なエラーハンドリング**: 構造化エラーと6種類のカテゴリ分類
- **環境変数システム**: TypeScript型定義と実行時検証
- **包括的ドキュメント**: 環境変数・セットアップガイド完備
- **CI/CD最適化**: 実行時間-33%（15分→10分）、年間200時間のコスト削減

## プロジェクト構造

```
src/
├── app/                    # Next.js App Router（ページ・レイアウト）
│   ├── [locale]/           # 多言語対応ルート（en/ja）
│   ├── api/                # APIルート
│   └── globals.css         # グローバルスタイル
├── components/             # Reactコンポーネント
│   ├── ui/                 # shadcn/ui基盤コンポーネント
│   ├── layout/             # Header, Footer, Navigation
│   ├── blog/               # ブログ関連
│   ├── docs/               # ドキュメント関連
│   └── releases/           # リリース関連
├── i18n/                   # 国際化設定（next-intl）
│   ├── routing.ts          # ルーティング設定
│   ├── request.ts          # メッセージローダー
│   └── navigation.ts       # ナビゲーション関数
├── config/                 # アプリケーション設定
│   └── env.ts              # 環境変数の型定義とバリデーション
├── lib/                    # ユーティリティライブラリ
│   ├── error-utils.ts      # エラーハンドリングユーティリティ
│   ├── metadata.ts         # SEOメタデータ生成
│   ├── mdx.ts              # MDX処理
│   └── utils.ts            # 汎用ユーティリティ
├── hooks/                  # カスタムフック
└── proxy.ts                # Next.js Proxy

messages/
├── en/                     # 英語翻訳
│   ├── common.json
│   ├── legal.json
│   ├── marketing.json
│   └── search.json
└── ja/                     # 日本語翻訳
    └── (同構造)

content/
├── blog/                   # ブログ記事（MDX）
├── docs/                   # ドキュメント（MDX）
└── releases/               # リリースノート（MDX）
```

## はじめに

### 前提条件

- Node.js 18.0以上
- npm、yarn、またはpnpm

### インストール

1. **リポジトリをクローン**

   ```bash
   git clone https://github.com/Dayopt/dayopt.git
   cd dayopt
   ```

2. **依存関係をインストール**

   ```bash
   npm install
   ```

3. **環境変数を設定**

   ```bash
   cp .env.example .env.local
   ```

   `.env.local`を編集して設定値を入力してください。

4. **開発サーバーを起動**

   ```bash
   npm run dev
   ```

5. **ブラウザで開く**
   [http://localhost:3000](http://localhost:3000)にアクセス

## 利用可能なスクリプト

### 開発

| スクリプト      | 説明             |
| --------------- | ---------------- |
| `npm run dev`   | 開発サーバー起動 |
| `npm run build` | 本番用ビルド     |
| `npm run start` | 本番サーバー起動 |

### 品質管理

| スクリプト             | 説明                 |
| ---------------------- | -------------------- |
| `npm run lint`         | ESLint実行           |
| `npm run lint:fix`     | ESLint自動修正       |
| `npm run type-check`   | TypeScript型チェック |
| `npm run format`       | Prettier実行         |
| `npm run format:check` | Prettierチェック     |

### 分析・監査

| スクリプト                    | 説明                           |
| ----------------------------- | ------------------------------ |
| `npm run analyze`             | バンドルサイズ分析             |
| `npm run audit:accessibility` | アクセシビリティ監査           |
| `npm run audit:performance`   | パフォーマンス監査             |
| `npm run test:a11y`           | ビルド後アクセシビリティテスト |
| `npm run test:performance`    | ビルド後パフォーマンステスト   |

### 本番準備

| スクリプト                   | 説明                                     |
| ---------------------------- | ---------------------------------------- |
| `npm run prepare:production` | console削除 + lint + 型チェック + ビルド |
| `npm run cleanup:console`    | console.log削除                          |

## 設定

### 環境変数

`.env.example`を参考に`.env.local`を作成してください：

```bash
# 必須
NEXT_PUBLIC_SITE_URL=https://yoursite.com
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# オプション
CONTACT_EMAIL=contact@yoursite.com
SENDGRID_API_KEY=your-sendgrid-key
```

### コンテンツ管理

コンテンツはMDXファイルで管理します：

- `content/blog/` - ブログ記事
- `content/docs/` - ドキュメント
- `content/releases/` - リリースノート

各ファイルにはFrontmatterメタデータが必要です：

```markdown
---
title: '記事タイトル'
description: '記事の説明'
date: '2025-01-01'
tags: ['タグ1', 'タグ2']
---

コンテンツ本文...
```

## デプロイ

### Vercel（推奨）

1. Vercelにリポジトリを接続
2. 環境変数をVercelダッシュボードで設定
3. mainブランチへのpushで自動デプロイ

### 手動デプロイ

```bash
# ビルド
npm run build

# 本番サーバー起動
npm run start
```

詳細は[DEPLOYMENT.md](DEPLOYMENT.md)を参照してください。

## パフォーマンス監視

### Core Web Vitals目標

| 指標                           | 目標値  |
| ------------------------------ | ------- |
| LCP (Largest Contentful Paint) | < 2.5秒 |
| FID (First Input Delay)        | < 100ms |
| CLS (Cumulative Layout Shift)  | < 0.1   |

### バンドル分析

```bash
npm run analyze
```

## アクセシビリティ

WCAG 2.1 AA準拠を完全サポート：

- セマンティックHTML構造
- ARIAラベルとロール
- キーボードナビゲーション対応
- スクリーンリーダー互換性
- 色コントラスト準拠
- フォーカス管理
- モーション設定の尊重

## セキュリティ

### セキュリティヘッダー

- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Strict-Transport-Security

### 入力検証

- XSS対策
- SQLインジェクション対策
- CSRFトークン検証
- ファイルアップロード制限
- レート制限

## コントリビューション

1. リポジトリをフォーク
2. フィーチャーブランチを作成
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. 変更をコミット
   ```bash
   git commit -m 'feat: 新機能を追加'
   ```
4. ブランチにプッシュ
   ```bash
   git push origin feature/amazing-feature
   ```
5. プルリクエストを作成

### 開発ガイドライン

- TypeScript strictモードの要件を遵守
- アクセシビリティ準拠を維持
- すべてのパフォーマンス指標をクリア
- 必要に応じてドキュメントを更新

## 関連ドキュメント

- [CLAUDE.md](CLAUDE.md) - Claude Code向け開発ガイド
- [DEPLOYMENT.md](DEPLOYMENT.md) - デプロイガイド
- [docs/TESTING_AND_CICD_GUIDE.md](docs/TESTING_AND_CICD_GUIDE.md) - CI/CDガイド
- [docs/PERFORMANCE_GUIDE.md](docs/PERFORMANCE_GUIDE.md) - パフォーマンスガイド
- [docs/DOCUMENTATION_GUIDE.md](docs/DOCUMENTATION_GUIDE.md) - ドキュメントガイド

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルを参照してください。

---

**最終更新**: 2025年1月
**バージョン**: v3.0
