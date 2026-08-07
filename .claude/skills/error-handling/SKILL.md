---
name: error-handling
description: try/catch を新規に書く時、tRPC mutation/query の `onError` 実装時、ErrorBoundary の配置・粒度変更時、Sentry 連携コード（`captureException` / scope 設定）編集時、エラー正規化が漏れている実装を検出した時、ユーザー向けエラー通知が未実装の async 処理を見つけた時に発動。正規化・Sentry 送信・ユーザー通知・自動復旧の4責務を呼び出し側で組み合わせるパターンを適用する。型定義のみ・UI 文言のみの変更では発動しない。
effort: low
maxTurns: 10
---

# エラーハンドリングスキル

Dayoptのエラー処理パターン（層ごとに分散した4責務を呼び出し側で組み合わせる）を支援するスキル。

## When to Use

以下の状況で発動:

- try/catch を新規に書く時（外部依存呼び出し、async 境界、最上位 async ハンドラ）
- tRPC mutation/query に `onError` handler を追加する時
- 新規 ErrorBoundary を配置する時、または既存 ErrorBoundary の粒度を変える時
- Sentry 連携コード（`captureException` / scope / context 設定）を編集する時
- try/catch で `console.error` や生の `throw` のみでエラー正規化（`ServiceError` 化 / Sentry 送信）が漏れている実装を検出した時
- ユーザー向けエラー通知（toast / modal / inline alert）が未実装の mutation / async 処理を見つけた時

## When NOT to Use

- 型定義のみの変更（エラーフロー未変更、エラー型の export 追加など）
- テストの正常系 assertion 追加のみ（エラーパスを触らない）
- UI 文言のみの error message 修正（`docs/ai/copywriting.md` に従う、ロジック変更なし）

## エラー処理の全体像

統一パイプライン（単一の `AppError` 型 + 1 関数のハンドラ）は**存在しない**。正規化 / Sentry 送信 / ユーザー通知 / 自動復旧の 4 責務は層ごとに分散しており、呼び出し側がその層の道具を組み合わせる。

```
エラー発生 — どの層で起きたかで経路が分かれる
    ↓
┌─ server（tRPC service 層）────────────────────────────┐
│ 正規化: ServiceError を throw → handleServiceError が │
│         ERROR_CODE_MAP で TRPCError へ変換            │
│ ログ:   想定外は captureUnexpectedError 系で Sentry へ │
└───────────────────────────────────────────────────────┘
┌─ client（query / mutation）───────────────────────────┐
│ 自動復旧: QueryClient に一元設定（query 3回 /         │
│           mutation 1回。認証エラーと 404 は除外）      │
│ 通知:     各 mutation の onError で toast.error を     │
│           呼ぶ（中央ディスパッチャは無い —            │
│           書き忘れるとユーザーに何も見えない）         │
└───────────────────────────────────────────────────────┘
┌─ render（React）──────────────────────────────────────┐
│ ErrorBoundary → handleReactError → Sentry             │
│ fallback UI がユーザー通知を担う                       │
└───────────────────────────────────────────────────────┘
```

## グローバルエラーハンドラー

エラー処理を1関数へ集約する `handleError` のようなグローバルハンドラーは存在しない。ログ出力（Sentry）とユーザー通知（toast）は呼び出し側が個別に組み合わせる。

```typescript
import { captureUnexpectedError } from '@/lib/sentry';
import { toast } from '@/lib/toast';

// シンプルなエラー処理
try {
  await riskyOperation();
} catch (error) {
  captureUnexpectedError(error as Error, {
    source: 'component-name',
    operation: 'risky_operation',
  });
  toast.error('保存に失敗しました');
}
```

自動復旧（リトライ）は呼び出し側が opt-in するラッパー関数ではなく、`QueryClient`（`apps/product/src/lib/trpc/query-client.ts`）に一元設定されている:

```typescript
// apps/product/src/lib/trpc/query-client.ts（抜粋）
retry: (failureCount, error) => {
  if (isAuthError(error)) return false; // 認証エラーはリトライしない
  if (error && 'status' in error && error.status === 404) return false;
  return failureCount < 3;
},
retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
```

## エラーコード

サービスエラーコード → tRPC エラーコードのマッピングは `@/lib/trpc/error-code-map` の `ERROR_CODE_MAP` で定義（カテゴリ enum ではなくフラットな `Record<string, TRPCErrorCode>`）：

| カテゴリ（ファイル内コメント区分） | コード例                                   | 用途           |
| ---------------------------------- | ------------------------------------------ | -------------- |
| 共通エラー                         | `NOT_FOUND`, `VALIDATION_FAILED`           | 汎用エラー     |
| 認証・認可エラー                   | `UNAUTHORIZED`, `FORBIDDEN`                | 認証エラー     |
| Billing関連                        | `STRIPE_NOT_CONFIGURED`, `CHECKOUT_FAILED` | 課金エラー     |
| 外部カレンダー関連                 | `REAUTH_REQUIRED`, `PROVIDER_UNAVAILABLE`  | 外部連携エラー |

## ErrorBoundary配置

### 配置ルール

```
アプリ全体
└─ Layout ErrorBoundary（致命的エラー用）
   ├─ Feature ErrorBoundary（Plans）
   │  └─ コンポーネント
   ├─ Feature ErrorBoundary（Calendar）
   │  └─ コンポーネント
   └─ Feature ErrorBoundary（Tags）
      └─ コンポーネント
```

**ポイント**: 機能単位で分離し、部分的な復旧を可能にする

### 実装パターン

```tsx
// components/ErrorBoundary.tsx
'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { handleReactError } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // グローバルエラーハンドラーに報告
    handleReactError(error, errorInfo, {
      source: 'ErrorBoundary',
    });

    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
```

```tsx
// 使用例
<ErrorBoundary fallback={<ErrorFallback onRetry={() => window.location.reload()} />}>
  <TagList />
</ErrorBoundary>
```

### ErrorFallback コンポーネント

```tsx
interface ErrorFallbackProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorFallback({
  title = t('error.fallback.title'),
  description = t('error.fallback.description'),
  onRetry,
}: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <AlertCircle className="text-destructive mb-4 h-12 w-12" />
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-muted-foreground mt-2">{description}</p>
      {onRetry && (
        <Button onClick={onRetry} className="mt-4">
          再試行
        </Button>
      )}
    </div>
  );
}
```

## tRPCエラー → UIエラー変換

```typescript
// hooks/useErrorToast.ts
import { TRPCClientError } from '@trpc/client';
import { toast } from '@/lib/toast';

export function useErrorToast() {
  return (error: unknown) => {
    if (error instanceof TRPCClientError) {
      const code = error.data?.code;

      switch (code) {
        case 'UNAUTHORIZED':
          toast.error(t('error.unauthorized'));
          break;
        case 'FORBIDDEN':
          toast.error(t('error.forbidden'));
          break;
        case 'NOT_FOUND':
          toast.error(t('error.notFound'));
          break;
        case 'BAD_REQUEST':
          toast.error(error.message || t('error.badRequest'));
          break;
        default:
          toast.error(t('error.generic'));
      }
    } else {
      toast.error(t('error.unexpected'));
    }
  };
}
```

```typescript
// 使用例
const showErrorToast = useErrorToast();

const mutation = api.tags.create.useMutation({
  onError: showErrorToast,
});
```

## Sentry連携

`AppError` 型は存在しない。実装は `Error` をそのまま扱う（`apps/product/src/lib/sentry/integration.ts` 抜粋）:

```typescript
// lib/sentry/integration.ts（AppError 型は存在しない）
import * as Sentry from '@sentry/nextjs';

/** 未処理エラーを一度だけ Sentry に送信する */
export function captureUnexpectedError(error: Error, context: CaptureErrorContext = {}): void {
  if (capturedErrors.has(error)) return;
  capturedErrors.add(error);

  const { userId, componentStack, ...technicalContext } = context;
  const sanitized = sanitizeTechnicalContext(technicalContext);

  Sentry.withScope((scope) => {
    scope.setTags(stringTags(sanitized));
    if (hasErrorCode(error)) scope.setTag('errorCode', error.code);
    if (userId) scope.setUser({ id: userId });
    if (componentStack) scope.setContext('react', { componentStack });

    Sentry.captureException(error);
  });
}

// エラー境界と組み合わせ（digest 付き Server Component 失敗は onRequestError に任せる）
export function captureClientBoundaryError(
  error: Error & { digest?: string },
  context: CaptureErrorContext = {},
): void {
  if (error.digest) return;
  captureUnexpectedError(error, context);
}
```

## ユーザー通知パターン

### トースト（軽微なエラー）

```typescript
toast.error('保存に失敗しました', {
  description: '再試行してください',
  action: {
    label: '再試行',
    onClick: () => retry(),
  },
});
```

### モーダル（重要なエラー）

```typescript
// セッション期限切れなど
showErrorModal({
  title: 'セッションが期限切れです',
  description: '再ログインしてください',
  action: {
    label: 'ログイン',
    onClick: () => router.push('/login'),
  },
});
```

### インライン（フォームエラー）

```tsx
<FormField
  error={errors.email?.message}
  // ...
/>
```

## チェックリスト

エラー処理実装時：

- [ ] 適切なエラーコードを使用したか
- [ ] ユーザー向けメッセージを設定したか
- [ ] Sentry連携を確認したか
- [ ] 復旧可能なエラーは自動復旧を検討したか

ErrorBoundary配置時：

- [ ] 機能単位で分離したか
- [ ] 適切なfallbackを設定したか
- [ ] 再試行ボタンを提供したか

## 関連ファイル

```
apps/product/src/lib/sentry/                  # Sentry連携（integration.ts, scrub-pii.ts）
apps/product/src/lib/trpc/errors.ts           # tRPCエラーハンドリング（handleServiceError, ServiceError）
apps/product/src/lib/trpc/error-code-map.ts   # エラーコードマッピング（ERROR_CODE_MAP）
apps/product/src/lib/tanstack-query/          # TanStack Queryキャッシュ・楽観的更新
```

## 関連スキル

- `/trpc-router-creating` - tRPCエラーコード
- `/security` - 認証エラー処理
