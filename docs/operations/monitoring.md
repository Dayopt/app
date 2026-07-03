---
status: current
last_verified: 2026-07-03
---

# 監視・アラート

Sentry統合（アーキテクチャ・実装ガイド・運用）、Sentryアラート設定手順、バンドルサイズ監視、パフォーマンス監視運用を集約する。障害対応時のトリアージは [runbook.md](./runbook.md) を参照。

---

# 第1部: Sentry 統合ガイド

DayoptアプリケーションにおけるSentryの統合・設定・運用の完全ガイド。

## 概要

### Sentryとは

Sentryはリアルタイムエラー追跡・パフォーマンス監視プラットフォーム。Dayoptでは以下の目的で使用している：

- **エラー監視**: 本番環境でのリアルタイムエラー捕捉・通知
- **パフォーマンス監視**: Core Web Vitals・API応答時間の測定
- **デバッグ支援**: ソースマップによる元コードの表示
- **ユーザーコンテキスト**: エラー発生時のユーザー情報・環境情報の記録

### Dayoptでの活用

```typescript
// エラーパターン辞書との統合
import { reportToSentry } from '@/lib/sentry';
import { AppError } from '@/config/error-patterns';

try {
  await riskyOperation();
} catch (error) {
  const appError = new AppError('操作に失敗', 'SYSTEM_ERROR_500', { error });
  reportToSentry(appError); // 自動分類・構造化レポート
}
```

## アーキテクチャ（v2.0）

### Sentry SDK v10 + Next.js 15 ベストプラクティス

Dayoptは **Sentry SDK v10** と **Next.js 15** の公式推奨構成に従っている。

### ファイル構成

```
dayopt/
├── instrumentation.ts           # サーバー・エッジ初期化ルーター（Next.js 15標準）
├── instrumentation-client.ts    # クライアント初期化
├── sentry.server.config.ts      # Node.jsランタイム設定
├── sentry.edge.config.ts        # Edgeランタイム設定
├── next.config.mjs              # withSentryConfig()統合
├── .sentryclirc                 # Sentry CLI設定
└── src/platform/sentry/           # ヘルパー関数
    ├── index.ts                   # エクスポート
    ├── integration.ts             # エラーパターン統合・Sentry連携
    ├── performance.ts             # パフォーマンス監視
    ├── trace.ts                   # カスタムトレース
    └── WebVitalsReporter.tsx      # Web Vitals レポーター
```

### 各ファイルの役割

| ファイル                    | 実行環境       | 責務                                   |
| --------------------------- | -------------- | -------------------------------------- |
| `instrumentation.ts`        | サーバー起動時 | 環境判定してserver/edge設定を読み込み  |
| `instrumentation-client.ts` | ブラウザ       | クライアント初期化・Replay・Web Vitals |
| `sentry.server.config.ts`   | Node.js        | サーバーサイドエラー監視               |
| `sentry.edge.config.ts`     | Edge Runtime   | Middleware/Edge API監視                |
| `next.config.mjs`           | ビルド時       | ソースマップアップロード・設定統合     |

### データフロー

```
エラー発生
  ↓
AppError生成（エラーパターン辞書）
  ↓
reportToSentry()  ← src/platform/sentry/integration.ts
  ↓
カテゴリ別タグ付与・フィンガープリント生成
  ↓
Sentry送信（自動分類・構造化）
  ↓
Sentryダッシュボード表示
```

### 自動報告パイプライン

手動の `reportToSentry()` 呼び出しに加え、以下の3つの自動報告が有効：

| パイプライン             | 送信元                 | 対象                                       |
| ------------------------ | ---------------------- | ------------------------------------------ |
| **CSP違反**              | `/api/csp-report`      | ブラウザ拡張機能以外のCSP違反              |
| **tRPCエラー**           | `handleServiceError()` | `INTERNAL_SERVER_ERROR` マッピングのエラー |
| **ユーザーコンテキスト** | 認証レイヤー           | ログイン中ユーザーのID（自動付与）         |

### 環境別設定

| 環境        | トレースサンプリング | Session Replay   | 有効/無効 |
| ----------- | -------------------- | ---------------- | --------- |
| Production  | 10%                  | エラー時のみ100% | 有効      |
| Preview     | 50%                  | なし             | 有効      |
| Development | 100%                 | なし             | 無効      |

## セットアップ

### ローカル環境

#### 1. Sentryアカウント作成

1. [Sentry.io](https://sentry.io) にアクセス
2. アカウント作成・ログイン
3. 新規プロジェクト作成
   - Platform: **Next.js**
   - Project Name: **dayopt**

#### 2. 必要な情報の取得

**DSN の取得**

1. プロジェクトを選択
2. **Settings** → **Client Keys (DSN)**
3. DSN をコピー（`https://xxx@sentry.io/xxx` 形式）

**Organization と Project の確認**

- **Organization Slug**: URLに表示される組織名（例: `my-org`）
- **Project Slug**: プロジェクト名（例: `dayopt`）

**Auth Token の生成**

1. **Settings** → **Auth Tokens**
2. **Create New Token**
3. **Scopes** を選択:
   - `project:releases`
   - `project:write`
   - `org:read`
4. 生成されたトークンを記録

#### 3. 環境変数設定

Sentry の値は 1Password master に保存し、`.op-env.local` の `op://` 参照で注入する。schema と同期手順は [secrets.md](./secrets.md) を参照。

#### 4. 動作確認

```bash
# Sentry設定検証
npm run sentry:verify

# 開発サーバー起動
pnpm dev

# テストエンドポイントにアクセス
curl http://localhost:3000/api/test/sentry?type=message
curl http://localhost:3000/api/test/sentry?type=error

# Sentryダッシュボードで確認（5分以内）
# https://sentry.io/organizations/[YOUR_ORG]/issues/
```

### Vercel環境

#### 1. Vercelダッシュボードで環境変数設定

1. https://vercel.com/dashboard にログイン
2. `dayopt` プロジェクトを選択
3. **Settings** → **Environment Variables**

#### 2. Sentry環境変数を追加

すべての環境（Production, Preview, Development）に追加：

| 変数名                    | 説明              |
| ------------------------- | ----------------- |
| `NEXT_PUBLIC_SENTRY_DSN`  | クライアント用DSN |
| `SENTRY_ORG`              | Organization Slug |
| `SENTRY_PROJECT`          | プロジェクト名    |
| `SENTRY_AUTH_TOKEN`       | 認証トークン      |
| `NEXT_PUBLIC_APP_VERSION` | アプリバージョン  |

## 実装ガイド

### エラーハンドリング

#### 基本的な使い方

```typescript
import { reportToSentry } from '@/lib/sentry';
import { AppError } from '@/config/error-patterns';

try {
  await fetchUserData(userId);
} catch (error) {
  const appError = new AppError('ユーザーデータの取得に失敗', 'DATA_NOT_FOUND_404', {
    userId,
    originalError: error,
  });
  reportToSentry(appError);
  throw appError;
}
```

#### Reactコンポーネントでのエラー

```typescript
import { handleReactError } from '@/lib/sentry';

class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    handleReactError(error, errorInfo);
  }
}
```

#### APIルートでのエラー

```typescript
import { handleApiError } from '@/lib/sentry';

export async function GET(request: Request) {
  try {
    const data = await fetchData();
    return Response.json(data);
  } catch (error) {
    handleApiError(error as Error, {
      endpoint: '/api/data',
      method: 'GET',
    });
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

### パフォーマンス監視

#### Web Vitals自動計測（2025基準準拠）

Web Vitalsは `instrumentation-client.ts` で自動計測される。

**計測される指標（Google 2025基準）**:

- **LCP** (Largest Contentful Paint): ≤ 2.5s (Good), > 4.0s (Poor)
- **INP** (Interaction to Next Paint): ≤ 200ms (Good), > 500ms (Poor)
- **CLS** (Cumulative Layout Shift): < 0.1 (Good), > 0.25 (Poor)
- **FCP** (First Contentful Paint): < 1.8s (Good), > 3.0s (Poor)
- **TTFB** (Time to First Byte): < 800ms (Good), > 1800ms (Poor)

#### カスタムパフォーマンストレース

```typescript
import { withTrace, traceApiCall, traceDbQuery } from '@/lib/sentry';

// API呼び出し計測
const tasks = await traceApiCall('GET /tasks', async () => {
  return await api.get('/tasks');
});

// データベースクエリ計測
const user = await traceDbQuery('users.findUnique', async () => {
  return await prisma.user.findUnique({ where: { id } });
});

// 汎用トレース
const { result, duration } = await withTrace(
  'complex-calculation',
  async () => {
    return await heavyComputation();
  },
  {
    op: 'function',
    tags: { complexity: 'high' },
  },
);
```

## 自動報告の詳細

### CSP違反 → Sentry

`/api/csp-report` エンドポイントで受信したCSP（Content Security Policy）違反をSentryに自動送信する。

**対象ファイル**: `src/app/api/csp-report/route.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

// ブラウザ拡張機能由来の違反はSentryクォータ節約のため除外
const IGNORED_URI_PREFIXES = ['chrome-extension://', 'moz-extension://', 'safari-extension://'];

// 拡張機能以外のCSP違反のみ送信
Sentry.captureMessage(`CSP Violation: ${directive}`, {
  level: 'warning',
  tags: { type: 'csp-violation', directive, blockedUri },
  contexts: { csp: { documentUri, effectiveDirective, sourceFile, lineNumber } },
});
```

**ポイント**:

- ブラウザ拡張機能のCSP違反は無視（`chrome-extension://` 等）
- `warning` レベルで送信（`error` ではない）
- Sentryダッシュボードで `type:csp-violation` タグでフィルタ可能

### tRPCエラー → Sentry自動報告

`handleServiceError()` で変換されるエラーのうち、`INTERNAL_SERVER_ERROR` にマッピングされるものを自動報告する。

**対象ファイル**: `src/platform/trpc/errors.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

// INTERNAL_SERVER_ERROR相当のエラーのみ報告
if (trpcCode === 'INTERNAL_SERVER_ERROR') {
  Sentry.captureException(error, {
    tags: { serviceErrorCode: error.code, source: 'trpc_service' },
  });
}
```

**報告対象の判定**:

| tRPC コード             | Sentryに報告 | 理由               |
| ----------------------- | ------------ | ------------------ |
| `INTERNAL_SERVER_ERROR` | **する**     | サーバー側の異常   |
| `BAD_REQUEST`           | しない       | ユーザー入力エラー |
| `NOT_FOUND`             | しない       | 通常のリクエスト   |
| `UNAUTHORIZED`          | しない       | 認証切れ等         |
| 未知のエラー            | **する**     | 予期しない障害     |

### Sentry.setUser() 自動設定

ログイン中のユーザーIDをSentryに自動設定し、エラー発生時にどのユーザーが影響を受けたか追跡可能にする。

**サーバー側**: `src/platform/trpc/procedures.ts`

```typescript
// protectedProcedure middleware内
Sentry.setUser({ id: ctx.userId });
```

**クライアント側**: `src/stores/useAuthStore.ts`

```typescript
// onAuthStateChange コールバック内
if (session?.user) {
  Sentry.setUser({ id: session.user.id });
} else {
  Sentry.setUser(null); // ログアウト時はクリア
}
```

**GDPR対応**: `id` のみ送信。メールアドレス等の個人情報は含めない。

## 運用

### ダッシュボード確認

#### Issues タブ

- 発生したエラーの一覧
- エラーの頻度・影響ユーザー数
- スタックトレース・ユーザーコンテキスト

#### Performance タブ

- ページロード時間
- API応答時間
- Core Web Vitals 2025 (LCP, INP, CLS, FCP, TTFB)

#### Releases タブ

- デプロイバージョン別のエラー追跡
- リグレッション検出

### アラート設定

推奨アラートルールの詳細は第2部を参照。

### カテゴリ別タグ設定

```typescript
const CATEGORY_TAGS = {
  AUTH: {
    domain: 'authentication',
    priority: 'high',
    team: 'security',
    alerting: 'immediate',
  },
  DB: {
    domain: 'database',
    priority: 'critical',
    team: 'backend',
    alerting: 'immediate',
  },
  // ... 他のカテゴリ
};
```

## トラブルシューティング（Sentry統合）

### 接続エラー

**症状**: `[Sentry] Cannot initialize SDK with the given DSN`

**解決方法**:

1. DSN の形式を確認
2. `.op-env.local` の `NEXT_PUBLIC_SENTRY_DSN` 参照を確認
3. 開発サーバーを再起動

```bash
# Sentry設定検証（推奨）
npm run sentry:verify

# 接続テスト実行
npm run sentry:test
```

### CSPエラー

**症状**: ブラウザコンソールに `Refused to connect to 'https://xxx.sentry.io'`

**解決方法**:

`next.config.mjs` の CSP `connect-src` に以下が含まれていることを確認:

```javascript
const connectSrc = [
  // ...
  'https://*.sentry.io',
  'https://*.ingest.sentry.io',
];
```

### Auth Token エラー

**症状**: `[Sentry] Unauthorized`

**解決方法**:

1. Auth Token のスコープを確認
   - `project:releases`
   - `project:write`
   - `org:read`
2. トークンの有効期限を確認
3. 新しいトークンを生成して再設定

### ソースマップが表示されない

**症状**: Sentryダッシュボードで元のTypeScriptコードが表示されない

**解決方法**:

1. `next.config.mjs` で `withSentryConfig` が適用されていることを確認
2. 環境変数が正しく設定されていることを確認:
   - `SENTRY_ORG`
   - `SENTRY_PROJECT`
   - `SENTRY_AUTH_TOKEN`
3. ビルドログでソースマップアップロードを確認

## FAQ（Sentry統合）

### Q1. Sentryの料金は？

Dayoptは無料プランで十分：

- 月5,000エラー
- 月10,000トランザクション
- 30日間のデータ保持

### Q2. エラーレートの目安は？

- **正常**: 1日あたり10件未満
- **注意**: 1日あたり10〜50件
- **警告**: 1日あたり50件以上（調査必要）

### Q3. パフォーマンス目標値は？

Core Web Vitals目標（2025基準）：

- **LCP**: ≤ 2.5秒 (Good)
- **INP**: ≤ 200ms (Good)
- **CLS**: < 0.1 (Good)

### Q4. ソースマップは本番環境に公開される？

いいえ。`withSentryConfig` の `hideSourceMaps: true` と `deleteSourcemapsAfterUpload: true` により、ソースマップはSentryに直接アップロードされ、本番環境には含まれない。

### Q5. ユーザーのプライバシーは保護される？

はい。以下の対応を実施：

- Session Replayで `maskAllText: true`, `blockAllMedia: true`
- GDPR対応: Cookie同意がある場合のみSentry有効化
- 個人情報（メールアドレス、パスワード等）はマスキング
- `Sentry.setUser()` は `id` のみ送信（email等は含めない）

## 参考リンク（Sentry統合）

### 公式ドキュメント

- [Sentry Next.js Guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Manual Setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Sentry Error Monitoring](https://docs.sentry.io/product/issues/)

### Dayopt関連

- **エラーパターン**: Storybook → Docs/Architecture/Error Patterns
- **アラート設定**: 第2部を参照

### ヘルパースクリプト

- **設定検証**: `npm run sentry:verify`
- **接続テスト**: `npm run sentry:test`

---

# 第2部: Sentryアラート設定ガイド

Sentryダッシュボードでアラート・通知を設定する手順書。

## 前提条件

### 必要なもの

- Sentryアカウント（Owner または Admin権限）
- Dayoptプロジェクトが作成済み
- 1Password master に `NEXT_PUBLIC_SENTRY_DSN` 設定済み
- Slack連携の場合: Slackワークスペースの管理者権限

### 確認方法

```bash
# ローカル環境でSentry接続確認
npm run sentry:verify

# テストイベント送信
pnpm dev
curl http://localhost:3000/api/test/sentry?type=message
```

Sentryダッシュボード（https://sentry.io）でイベントが表示されればOK

## 基本アラートルール設定

### 1. Sentryダッシュボードにアクセス

1. https://sentry.io にログイン
2. プロジェクト **dayopt** を選択
3. 左サイドバー → **Alerts** をクリック

### 2. 新規アラートルール作成

1. **Create Alert Rule** ボタンをクリック
2. アラートタイプを選択:
   - **Issues**: エラー検知
   - **Metric Alerts**: メトリクス監視（パフォーマンス等）

### 3. アラート設定の基本構造

```
IF [条件]
THEN [アクション]
```

**条件例**:

- `The issue is first seen` - 新規エラー
- `The issue changes state` - エラーの状態変化
- `Number of events in an issue is above X` - エラー回数閾値超過

**アクション例**:

- Send a notification to **Email**
- Send a notification to **Slack**
- Send a notification via **Webhook**

## Slack通知設定

### Step 1: Slack統合の有効化

1. Sentryダッシュボード → **Settings** → **Integrations**
2. **Slack** を検索
3. **Add Workspace** をクリック
4. Slackワークスペースを選択して認証

### Step 2: 通知チャンネル設定

1. Alerts設定画面で **Action** セクション
2. **Add Action** → **Send a Slack notification**
3. **Workspace**: 連携したワークスペースを選択
4. **Channel**: 通知先チャンネル（例: `#alerts-production`）

**推奨チャンネル構成**:

```
#alerts-critical     - 緊急アラート（即対応必要）
#alerts-production   - 本番エラー全般
#alerts-performance  - パフォーマンス劣化
#alerts-dev          - 開発・ステージング環境
```

## 推奨アラート5件の設定

### 1. 新規エラー検知

**目的**: 初めて発生したエラーを即座に検知

#### 設定手順

1. **Create Alert Rule** → **Issues**
2. **Alert name**: `新規エラー検知`
3. **Environment**: `production`（本番のみ）
4. **条件設定**:
   - **When**: `The issue is first seen`
   - **Filter**: `level:error OR level:fatal`
5. **Action**:
   - Send email to: `your-email@example.com`
   - Send Slack notification to: `#alerts-critical`
6. **Save Rule**

### 2. エラー率急増検知

**目的**: 1時間で通常の10倍のエラーが発生した場合に通知

#### 設定手順

1. **Create Alert Rule** → **Metric Alerts**
2. **Alert name**: `エラー率急増`
3. **Environment**: `production`
4. **条件設定**:
   - **Metric**: `count()`
   - **Filter**: `event.type:error`
   - **When**: `the count of errors`
   - **Is**: `above 50` (1時間に50件以上)
   - **Time window**: `1 hour`
5. **Comparison** (オプション):
   - **Compared to**: `1 hour ago`
   - **Increase by**: `10x` (10倍)
6. **Action**:
   - Send Slack notification to: `#alerts-critical`
   - Send email to: `your-email@example.com`
7. **Save Rule**

### 3. パフォーマンス劣化検知（LCP/INP）

**目的**: Core Web Vitals が Google 2025基準の「Poor」を超えた場合に通知

#### 設定手順

1. **Create Alert Rule** → **Metric Alerts**
2. **Alert name**: `パフォーマンス劣化（LCP/INP）`
3. **Environment**: `production`
4. **条件設定（LCP）**:
   - **Metric**: `p75(measurements.lcp)`
   - **When**: `the 75th percentile of LCP`
   - **Is**: `above 4000` (4秒 = Poor閾値)
   - **Time window**: `1 hour`
5. **追加条件（INP）**:
   - **OR**
   - **Metric**: `p75(measurements.inp)`
   - **When**: `the 75th percentile of INP`
   - **Is**: `above 500` (500ms = Poor閾値)
   - **Time window**: `1 hour`
6. **Action**:
   - Send Slack notification to: `#alerts-performance`
7. **Save Rule**

#### Google 2025基準（参考）

- **LCP**: ≤ 2.5s (Good), > 4.0s (Poor)
- **INP**: ≤ 200ms (Good), > 500ms (Poor)
- **CLS**: < 0.1 (Good), > 0.25 (Poor)
- **FCP**: < 1.8s (Good), > 3.0s (Poor)
- **TTFB**: < 800ms (Good), > 1800ms (Poor)

### 4. クリティカルエラー検知（DB/セキュリティ）

**目的**: データベースエラー・セキュリティエラーの即座検知

#### 設定手順

1. **Create Alert Rule** → **Issues**
2. **Alert name**: `クリティカルエラー（DB/セキュリティ）`
3. **Environment**: `production`
4. **条件設定**:
   - **When**: `An event is captured`
   - **Filter**:
     ```
     (level:fatal OR level:error)
     AND (tags.category:DB OR tags.category:SECURITY)
     ```
5. **Action**:
   - Send Slack notification to: `#alerts-critical`
   - Send email to: `your-email@example.com`
   - **Priority**: High
6. **Save Rule**

#### カテゴリ（Dayopt実装）

`src/config/error-patterns.ts` で定義:

- `DB` - データベースエラー
- `SECURITY` - セキュリティエラー
- `API` - API呼び出しエラー
- `VALIDATION` - バリデーションエラー

**自動報告される追加タグ**:

- `source:trpc_service` — tRPCの `handleServiceError()` 経由のエラー
- `type:csp-violation` — CSP違反レポート

### 5. ユーザー影響大（多数ユーザーに影響）

**目的**: 1時間に10人以上のユーザーに影響があるエラーを検知

#### 設定手順

1. **Create Alert Rule** → **Metric Alerts**
2. **Alert name**: `ユーザー影響大`
3. **Environment**: `production`
4. **条件設定**:
   - **Metric**: `count_unique(user)`
   - **When**: `the count of unique users affected`
   - **Is**: `above 10`
   - **Time window**: `1 hour`
5. **Action**:
   - Send Slack notification to: `#alerts-critical`
   - **Mention**: `@channel` (全員に通知)
6. **Save Rule**

### 6. CSP違反検知（推奨）

**目的**: セキュリティポリシー違反を検知し、XSS等の攻撃を早期発見

#### 設定手順

1. **Create Alert Rule** → **Issues**
2. **Alert name**: `CSP違反検知`
3. **Environment**: `production`
4. **条件設定**:
   - **When**: `An event is captured`
   - **Filter**: `tags.type:csp-violation`
   - **Frequency**: `10 events in 1 hour`（大量違反時のみ通知）
5. **Action**:
   - Send Slack notification to: `#alerts-production`
6. **Save Rule**

> **注意**: ブラウザ拡張機能由来のCSP違反は `/api/csp-report` で自動フィルタ済みのため、このアラートに含まれない。

## 動作確認

### 1. アラートルールのテスト

Sentryダッシュボード → **Alerts** → 作成したルール → **...** → **Test Rule**

### 2. 実際のイベント送信

```bash
# 本番環境でテストイベント送信
pnpm dev

# 新規エラーをトリガー
curl http://localhost:3000/api/test/sentry?type=error

# Slackで通知を確認（5分以内）
```

### 3. アラート履歴確認

Sentryダッシュボード → **Alerts** → **History** タブ

## ベストプラクティス（アラート）

### 推奨事項

1. **環境別フィルタ必須**
   - 本番: `environment:production`
   - ステージング: `environment:preview`
   - 開発環境はアラート不要

2. **段階的な通知**
   - Warning → Slack
   - Critical → Slack + Email + @channel

3. **定期的なレビュー**
   - 月次: アラート発火頻度確認
   - 閾値の調整（誤検知削減）

4. **アラート疲れ対策**
   - 重要度低いアラートは日次サマリーに変更
   - 閾値を適切に設定（最初は緩め → 徐々に厳しく）

### 避けるべき設定

- 開発環境のエラーを本番アラートに含める
- すべてのアラートを @channel で通知（重要度の区別）
- 閾値を厳しくしすぎてノイズだらけ
- アラート受信者が不在時の対応未定義

## トラブルシューティング（アラート）

### Slack通知が届かない

**確認項目**:

1. Slack統合が有効か（Settings → Integrations → Slack）
2. チャンネル名が正しいか（`#`なしで入力）
3. Sentryボットがチャンネルに招待されているか

**解決方法**:

```
Slackチャンネルで:
/invite @Sentry
```

### アラートが発火しない

**確認項目**:

1. 条件式が正しいか（Test Ruleで確認）
2. Environmentフィルタが正しいか
3. 実際にエラーが発生しているか（Issues タブで確認）

### 誤検知が多い

**対策**:

1. 閾値を緩める（例: 50件 → 100件）
2. 時間窓を広げる（例: 1時間 → 6時間）
3. Environmentフィルタを厳しく（`production` のみ）
4. 特定エラーを除外（`AND NOT message:"Expected error"`）

## 関連ドキュメント（アラート）

- **エラーパターン辞書**: `src/config/error-patterns.ts`
- **Sentry公式ドキュメント**: https://docs.sentry.io/product/alerts/

---

# 第3部: バンドルサイズ監視

Dayoptアプリケーションのバンドルサイズ監視とパフォーマンス最適化のリファレンス。

## バンドルサイズ制限

### JavaScript

| 項目           | 制限  |
| -------------- | ----- |
| メインJS合計   | 800KB |
| 初期読み込みJS | 500KB |
| 個別チャンク   | 250KB |

### CSS

| 項目            | 制限  |
| --------------- | ----- |
| CSS合計         | 150KB |
| 初期読み込みCSS | 100KB |

### 総合

| 項目           | 制限                         |
| -------------- | ---------------------------- |
| 全バンドル合計 | 1MB                          |
| 警告しきい値   | 80%（制限の80%に到達で警告） |

## コマンド

### バンドルサイズチェック

```bash
npm run bundle:check           # 基本的なバンドルサイズチェック
npm run bundle:check:verbose   # 詳細出力でのチェック
npm run bundle:analyze         # バンドル分析レポート生成
npm run bundle:monitor         # チェック + 分析の組み合わせ
```

### ESLint バンドル最適化

```bash
npm run lint:bundle            # バンドル最適化ルールのチェック
npm run lint:bundle:strict     # 厳格モード（エラーレベル）
npm run lint:imports           # インポート順序チェック
```

## 監視の仕組み

### 自動チェック

- **PR作成時**: 自動的にバンドルサイズをチェック
- **Push時**: main/devブランチへのpushで監視実行
- **比較分析**: PRの変更前後でサイズ比較

### レポートの読み方

```
✅ 総合サイズ: 756.3 KB / 1000.0 KB (75.6%)
✅ JavaScript合計: 623.1 KB / 800.0 KB (77.9%)
⚠️ 初期読み込みJS: 425.7 KB / 500.0 KB (85.1%)
✅ CSS合計: 133.2 KB / 150.0 KB (88.8%)
```

- ✅ 正常: 制限内
- ⚠️ 警告: 80%を超過
- ❌ エラー: 制限を超過

## 最適化のベストプラクティス（バンドル）

### 1. 動的インポート（コードスプリッティング）

```tsx
// ❌ 避ける：静的インポート（大きなコンポーネント）
import HeavyComponent from './HeavyComponent';

// ✅ 推奨：Next.js dynamic imports
import dynamic from 'next/dynamic';
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <div>Loading...</div>,
});
```

### 2. ライブラリのTree-shaking

```tsx
// ❌ 避ける：ライブラリ全体のインポート
import * as lodash from 'lodash';

// ✅ 推奨：必要な関数のみインポート
import { debounce } from 'lodash';
import { format } from 'date-fns';
```

### 3. バレルファイルの適切な使用

```tsx
// ❌ 避ける：バレルファイルから大量インポート
import { A, B, C, D, E, F } from '@/components';

// ✅ 推奨：直接インポート
import A from '@/lib/components/A';
import B from '@/lib/components/B';
```

## カスタム設定

### 制限値の変更

```javascript
// scripts/bundle-check.js
const BUNDLE_LIMITS = {
  maxTotalJS: 800 * 1024,
  maxInitialJS: 500 * 1024,
  maxChunkJS: 250 * 1024,
  maxTotalCSS: 150 * 1024,
  maxInitialCSS: 100 * 1024,
  maxTotal: 1000 * 1024,
  warningThreshold: 0.8,
};
```

## トラブルシューティング（バンドル）

### バンドルサイズが突然増加した場合

1. **新しい依存関係**: `package.json` の変更を確認
2. **大きなアセット**: 画像やフォントファイルの追加を確認
3. **コードの重複**: ESLintの `import/no-duplicates` エラーを確認

### ビルドエラーが発生する場合

```bash
rm -rf .next
npm run build

# 依存関係の再インストール
rm -rf node_modules package-lock.json
npm install
```

## 機能追加時のチェックリスト（バンドル）

- [ ] 新しいライブラリは必要最小限か?
- [ ] Tree-shakingは有効か?
- [ ] 動的インポートは適用可能か?
- [ ] `npm run bundle:check` は通過するか?

## 関連ページ（バンドル）

- [Next.js最適化](../guides/nextjs-optimization.md)

---

# 第4部: Performance Monitoring 運用

性能予算・SLO・設計方針は [Performance Budget](../architecture/frontend/performance.md) を参照。本セクションは監視・計測の運用のみを扱う。

## 監視ツールの使い分け

| ツール            | 役割                   | 見るもの                         |
| ----------------- | ---------------------- | -------------------------------- |
| **Sentry**        | エラー・パフォーマンス | Issues, Web Vitals, Transactions |
| **Lighthouse CI** | リリース前チェック     | Core Web Vitals                  |

Sentry の詳細運用は第1部・第2部、bundle sizeの監視は第3部を参照。
