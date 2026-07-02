---
status: current
last_verified: 2026-06-17
---

# ErrorBoundary 自動復旧システム

4段階の復旧戦略（自動→手動→リロード→ホーム）を持つエラーハンドリングシステム。

---

## 主要機能

- **全画面レベル保護** — アプリケーション全体をエラーから守る
- **自動エラー分析** — エラーの種類・重要度・復旧可能性を自動判定
- **段階的復旧** — 自動→手動→リロード→ホームの4段階
- **カテゴリ別フォールバック** — エラータイプに最適化されたUI

---

## システム構成

```
src/
├── components/
│   ├── common/
│   │   ├── GlobalErrorBoundary.tsx      # 全画面レベルエラーバウンダリー
│   │   └── ErrorFallbacks.tsx           # カテゴリ別フォールバック
│   └── error-boundary.tsx               # ErrorBoundary, FeatureErrorBoundary
├── hooks/
│   └── useAutoRetry.ts                  # 自動リトライフック群
├── config/
│   └── error-patterns.ts                # エラーパターン辞書
└── constants/
    └── errorCodes.ts                    # エラーコード体系
```

---

## 基本的な使い方

### グローバルエラーバウンダリー（自動適用済み）

```tsx
// src/app/layout.tsx
<GlobalErrorBoundary maxRetries={3} retryDelay={1000} onError={handleGlobalError}>
  <Providers>
    {children}
    <ToastContainer />
  </Providers>
</GlobalErrorBoundary>
```

### コンポーネント別エラーバウンダリー

```tsx
import { SmartErrorBoundary, DatabaseErrorFallback } from '@/lib/components/common'

// 自動判定（推奨）
<SmartErrorBoundary>
  <YourComponent />
</SmartErrorBoundary>

// 特定のフォールバックを指定
<SmartErrorBoundary fallbackComponent={DatabaseErrorFallback}>
  <DatabaseComponent />
</SmartErrorBoundary>
```

### 自動リトライフック

```tsx
import { useApiRetry, useDataFetchRetry } from '@/lib/components/common';

// API呼び出し用
const { execute, isLoading, retry, error } = useApiRetry(async () => {
  const response = await fetch('/api/data');
  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  return response.json();
});

// データフェッチ用
const dataRetry = useDataFetchRetry(async () => {
  return await fetchUserData();
});
```

---

## カテゴリ別フォールバック

| フォールバック          | 用途                   | 特徴                   |
| ----------------------- | ---------------------- | ---------------------- |
| `NetworkErrorFallback`  | ネットワーク接続エラー | Wi-Fi・接続確認の案内  |
| `DatabaseErrorFallback` | データベースエラー     | 自動修復中の表示       |
| `APIErrorFallback`      | API通信エラー          | サーバー通信問題の説明 |
| `AuthErrorFallback`     | 認証エラー             | ログインページへの誘導 |
| `UIErrorFallback`       | UIコンポーネントエラー | 軽量な再表示ボタン     |
| `GenericErrorFallback`  | 汎用エラー             | あらゆるエラーに対応   |

### 自動選択（推奨）

```tsx
import { selectErrorFallback } from '@/lib/components/common'

const FallbackComponent = selectErrorFallback(error)
<FallbackComponent error={error} resetErrorBoundary={reset} />
```

---

## 復旧戦略の階層

### 1. 自動リトライ（バックグラウンド）

- 指数バックオフ（1秒 → 2秒 → 4秒）
- 最大3回まで自動実行
- ユーザーの操作を中断しない

### 2. 手動リトライ（ユーザー操作）

- 「手動再試行」ボタン
- リトライ回数表示

### 3. ページ再読み込み（確実な復旧）

- 「ページ再読み込み」ボタン
- アプリケーション全体をリセット

### 4. ホーム画面誘導（最終手段）

- 「ホームに戻る」ボタン
- 安全な画面への誘導

---

## 設定オプション

### GlobalErrorBoundary設定

```tsx
<GlobalErrorBoundary
  maxRetries={3} // 最大リトライ回数
  retryDelay={1000} // 初期遅延時間（ms）
  onError={(error, errorInfo, retryCount) => {
    // Sentryへの送信など
  }}
>
  {children}
</GlobalErrorBoundary>
```

### useAutoRetry設定

```tsx
const config = {
  maxRetries: 3,
  initialDelay: 1000,
  backoffFactor: 2,
  maxDelay: 30000,
  shouldRetry: (error: Error, retryCount: number) => {
    return error.message.includes('network') && retryCount < 3;
  },
  onRetry: (error: Error, retryCount: number) => {
    // リトライ時のコールバック
  },
  onFinalFailure: (error: Error, retryCount: number) => {
    // 最終失敗時のコールバック
  },
};
```

---

## ベストプラクティス

### エラーバウンダリーの配置

```tsx
// ❌ 全体を1つのエラーバウンダリーでラップ
<ErrorBoundary>
  <Header />
  <Sidebar />
  <Main />
</ErrorBoundary>

// ✅ 重要なコンポーネントごとに配置
<div>
  <Header />
  <SmartErrorBoundary>
    <Sidebar />
  </SmartErrorBoundary>
  <SmartErrorBoundary>
    <Main />
  </SmartErrorBoundary>
</div>
```

### リトライ設定の最適化

```tsx
// API呼び出し：積極的にリトライ
const apiRetry = useApiRetry(apiCall, {
  maxRetries: 3,
  initialDelay: 1000,
});

// ユーザーアクション：控えめにリトライ
const userActionRetry = useUserActionRetry(userAction, {
  maxRetries: 1,
  initialDelay: 2000,
});
```

---

## 関連ページ

- [エラーパターン](../architecture/conventions/error-patterns.md) — エラーコード体系・Sentry連携
- [Patterns/ErrorPages](../architecture/frontend/error-pages.md) — エラーページのUIパターン

---

**最終更新**: 2026-02-12 | **バージョン**: v1.0
