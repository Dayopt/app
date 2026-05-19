# 環境変数セットアップガイド

Dayopt Web の環境変数設定に関する完全なガイドです。

## 目次

- [クイックスタート](#クイックスタート)
- [環境変数一覧](#環境変数一覧)
- [型安全性](#型安全性)
- [バリデーション](#バリデーション)
- [開発環境のセットアップ](#開発環境のセットアップ)
- [本番環境のセットアップ](#本番環境のセットアップ)
- [トラブルシューティング](#トラブルシューティング)

---

## クイックスタート

### 開発環境（最小構成）

```bash
# 1. .env.example をコピー
cp .env.example .env.local

# 2. 開発サーバー起動（環境変数は任意）
npm run dev
```

開発環境では、ほとんどの環境変数が任意です。デフォルト値で動作します。

### 本番環境（必須設定）

```bash
# Vercel Dashboard で以下を設定:
# - GITHUB_TOKEN (必須)
# - UPSTASH_REDIS_REST_URL (推奨)
# - UPSTASH_REDIS_REST_TOKEN (推奨)
```

---

## 環境変数一覧

### Node.js 環境

| 変数名     | 型                                        | デフォルト      | 必須 | 説明                                        |
| ---------- | ----------------------------------------- | --------------- | ---- | ------------------------------------------- |
| `NODE_ENV` | `'development' \| 'production' \| 'test'` | `'development'` | ❌   | 実行環境（Next.jsが自動設定）               |
| `CI`       | `boolean`                                 | `undefined`     | ❌   | CI/CD環境フラグ（GitHub Actionsが自動設定） |

### アプリケーション設定

| 変数名                 | 型       | デフォルト            | 必須        | 説明                                                  |
| ---------------------- | -------- | --------------------- | ----------- | ----------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`  | `string` | `undefined`           | ⚠️ 本番のみ | アプリケーションの公開URL<br>例: `https://dayopt.app` |
| `NEXT_PUBLIC_SITE_URL` | `string` | `NEXT_PUBLIC_APP_URL` | ❌          | SEO・OGP用のサイトURL                                 |
| `VERCEL_URL`           | `string` | `undefined`           | ❌          | VercelデプロイURL（自動設定）                         |

### セキュリティ設定

| 変数名                    | 型                     | デフォルト | 必須 | 説明                                                                                                             |
| ------------------------- | ---------------------- | ---------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| `PRIVACY_PROTECTION_MODE` | `'normal' \| 'strict'` | `'normal'` | ❌   | プライバシー保護モード<br>- `normal`: 部分マスク (u\*\*\*@example.com)<br>- `strict`: 完全マスク (\*\*\*@\*\*\*) |

### 外部サービス - GitHub

| 変数名                | 型       | デフォルト             | 必須        | 説明                                                                  |
| --------------------- | -------- | ---------------------- | ----------- | --------------------------------------------------------------------- |
| `GITHUB_TOKEN`        | `string` | `undefined`            | ⚠️ 本番のみ | GitHub Personal Access Token<br>スコープ: `repo` または `public_repo` |
| `GITHUB_CONTACT_REPO` | `string` | `'t3-nico/dayopt-web'` | ❌          | コンタクトフォームのIssue作成先リポジトリ<br>形式: `owner/repo`       |

### 外部サービス - Upstash (Rate Limiting)

| 変数名                     | 型       | デフォルト  | 必須 | 説明                                                                 |
| -------------------------- | -------- | ----------- | ---- | -------------------------------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`   | `string` | `undefined` | ❌   | Upstash Redis REST API URL<br>未設定時はメモリベースにフォールバック |
| `UPSTASH_REDIS_REST_TOKEN` | `string` | `undefined` | ❌   | Upstash Redis REST API Token<br>URLと両方設定する必要あり            |

### SEO - 検索エンジン検証

| 変数名                     | 型       | デフォルト  | 必須 | 説明                             |
| -------------------------- | -------- | ----------- | ---- | -------------------------------- |
| `GOOGLE_SITE_VERIFICATION` | `string` | `undefined` | ❌   | Google Search Console 検証コード |
| `YANDEX_VERIFICATION`      | `string` | `undefined` | ❌   | Yandex Webmaster 検証コード      |
| `YAHOO_VERIFICATION`       | `string` | `undefined` | ❌   | Yahoo! Search 検証コード         |

---

## 型安全性

Dayopt Web では、環境変数アクセスが完全に型安全です。

### 従来の問題

```typescript
// ❌ 問題: 常に string | undefined 型
const token = process.env.GITHUB_TOKEN; // string | undefined
const mode = process.env.PRIVACY_PROTECTION_MODE; // string | undefined

// 型安全性がない
if (mode === 'strict') {
  /* ... */
} // 型エラーなし（実行時エラーの可能性）
```

### Dayopt の実装

```typescript
import { env, isDevelopment, getAppUrl } from '@/config/env';

// ✅ 型安全なアクセス
const token = env.GITHUB_TOKEN; // string | undefined
const mode = env.PRIVACY_PROTECTION_MODE; // 'normal' | 'strict'

// 型チェックが効く
if (mode === 'strict') {
  /* ... */
} // OK
if (mode === 'invalid') {
  /* ... */
} // コンパイルエラー！

// ヘルパー関数
if (isDevelopment) {
  /* ... */
}
const url = getAppUrl(); // string (優先順位付きフォールバック)
```

### 型定義

全ての環境変数型は [`src/config/env.ts`](../src/config/env.ts) で定義されています:

```typescript
export interface EnvConfig {
  NODE_ENV: NodeEnv;
  PRIVACY_PROTECTION_MODE?: PrivacyMode;
  GITHUB_TOKEN?: string;
  // ... 他の環境変数
}

export type NodeEnv = 'development' | 'production' | 'test';
export type PrivacyMode = 'normal' | 'strict';
```

---

## バリデーション

アプリケーション起動時に環境変数の検証が実行されます。

### 必須チェック

以下の条件でエラーをスローします:

```typescript
// 本番環境: NEXT_PUBLIC_APP_URL または VERCEL_URL が必須
if (env.NODE_ENV === 'production' && !env.NEXT_PUBLIC_APP_URL && !env.VERCEL_URL) {
  throw new EnvValidationError('...');
}

// 本番環境: GITHUB_TOKEN が必須
if (env.NODE_ENV === 'production' && !env.GITHUB_TOKEN) {
  throw new EnvValidationError('...');
}
```

### 警告のみ

以下の条件で警告を表示します:

```typescript
// 開発環境: GITHUB_TOKEN 未設定
// → コンタクトフォームが動作しませんが、開発は継続可能

// Upstash: URL と TOKEN の片方のみ設定
// → メモリベースのレート制限にフォールバック
```

### カスタムバリデーション

必要に応じて `src/config/env.ts` の `validateRequiredEnv()` を編集してください。

---

## 開発環境のセットアップ

### 1. 基本セットアップ（環境変数なし）

最小構成で開発を開始できます:

```bash
npm run dev
```

この状態でも以下が動作します:

- ✅ すべてのページ表示
- ✅ 検索機能（メモリベースのレート制限）
- ✅ タグ機能（メモリベースのレート制限）
- ❌ コンタクトフォーム（GITHUB_TOKEN 不足）

### 2. コンタクトフォームのテスト

コンタクトフォームをテストする場合:

```bash
# 1. .env.local を作成
cp .env.example .env.local

# 2. GitHub Personal Access Token を取得
# https://github.com/settings/tokens/new
# スコープ: repo (プライベートリポジトリの場合) または public_repo

# 3. .env.local に追加
echo "GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxx" >> .env.local
echo "GITHUB_CONTACT_REPO=your-org/your-repo" >> .env.local

# 4. 開発サーバー再起動
npm run dev
```

### 3. Upstash レート制限のテスト

Redisベースのレート制限をテストする場合:

```bash
# 1. Upstash アカウント作成
# https://console.upstash.com/

# 2. Redis データベース作成

# 3. REST API 情報を .env.local に追加
echo "UPSTASH_REDIS_REST_URL=https://xxx.upstash.io" >> .env.local
echo "UPSTASH_REDIS_REST_TOKEN=xxxxxxxxxx" >> .env.local

# 4. 開発サーバー再起動
npm run dev
```

---

## 本番環境のセットアップ

### Vercel デプロイ

#### 1. Vercel Dashboard で環境変数を設定

**必須:**

- `GITHUB_TOKEN`: GitHub Personal Access Token
  - Settings → Developer settings → Personal access tokens → Generate new token
  - スコープ: `repo` または `public_repo`

**推奨:**

- `UPSTASH_REDIS_REST_URL`: Upstash Redis URL
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis Token
  - 未設定の場合、メモリベースにフォールバック（Vercel Serverless では非推奨）

**任意:**

- `GITHUB_CONTACT_REPO`: デフォルトは `t3-nico/dayopt-web`
- `PRIVACY_PROTECTION_MODE`: デフォルトは `normal`
- `GOOGLE_SITE_VERIFICATION`: Google Search Console 検証用
- `YANDEX_VERIFICATION`: Yandex Webmaster 検証用
- `YAHOO_VERIFICATION`: Yahoo! Search 検証用

#### 2. デプロイ

```bash
# Vercel CLI でデプロイ
vercel --prod

# または Git push で自動デプロイ
git push origin main
```

### 他のホスティングサービス

環境変数を設定する方法は各サービスによって異なります:

- **Netlify**: Site settings → Environment variables
- **Railway**: Project settings → Variables
- **Render**: Environment → Environment Variables
- **AWS Amplify**: App settings → Environment variables

---

## トラブルシューティング

### エラー: "Environment Variable Validation Error"

```
Environment Variable Validation Error:
  - NEXT_PUBLIC_APP_URL or VERCEL_URL is required in production environment
```

**原因:** 本番環境でアプリケーションURLが設定されていません。

**解決方法:**

1. Vercel の場合: `VERCEL_URL` が自動設定されるため、通常は不要
2. その他の場合: `NEXT_PUBLIC_APP_URL=https://your-domain.com` を設定

### 警告: "GITHUB_TOKEN is not set"

```
[ENV WARNING] GITHUB_TOKEN is not set. Contact form will not work.
```

**原因:** GitHub Token が設定されていません。

**影響:** コンタクトフォームが動作しません。

**解決方法:**

- 開発環境: 警告を無視してもOK（コンタクトフォーム以外は動作）
- 本番環境: `GITHUB_TOKEN` を設定する

### 警告: "Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN should be set together"

```
[ENV WARNING] Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN should be set together.
Falling back to memory-based rate limiting.
```

**原因:** Upstash の URL と TOKEN の片方のみが設定されています。

**影響:** メモリベースのレート制限にフォールバック。

**解決方法:**

- 両方設定するか、両方削除する
- Vercel Serverless では Redis ベースを推奨

### TypeError: Cannot read property 'X' of undefined

```
TypeError: Cannot read property 'GITHUB_TOKEN' of undefined
```

**原因:** 古いコードで `process.env.*` を直接使用しています。

**解決方法:**

```typescript
// ❌ 古い
import { ... } from '...';
const token = process.env.GITHUB_TOKEN;

// ✅ 新しい
import { env } from '@/config/env';
const token = env.GITHUB_TOKEN;
```

### 開発サーバー起動時にエラーが出る

```bash
# .env.local の構文エラーをチェック
cat .env.local

# 不要な環境変数を削除
rm .env.local

# 再起動
npm run dev
```

---

## 関連ファイル

- [`src/config/env.ts`](../src/config/env.ts) - 環境変数の型定義とバリデーション
- [`.env.example`](../.env.example) - 環境変数設定例
- [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts) - レート制限設定
- [`src/lib/csrf-protection.ts`](../src/lib/csrf-protection.ts) - CSRF保護
- [`src/lib/privacy.ts`](../src/lib/privacy.ts) - プライバシー保護

---

## 参考リンク

- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [Upstash Documentation](https://docs.upstash.com/)

---

**最終更新**: 2025年12月
