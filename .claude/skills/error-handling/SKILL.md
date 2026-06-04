---
name: error-handling
description: try/catch を新規に書く時、tRPC mutation/query の `onError` 実装時、ErrorBoundary の配置・粒度変更時、Sentry 連携コード（`captureException` / scope 設定）編集時、AppError 正規化が漏れている実装を検出した時、ユーザー向けエラー通知が未実装の async 処理を見つけた時に発動。AppError 正規化 → ログ出力 → ユーザー通知 → 自動復旧の4段パターンを適用する。型定義のみ・UI 文言のみの変更では発動しない。
effort: low
maxTurns: 10
---

# エラーハンドリングスキル

Dayoptでの統一エラー処理パターンを支援するスキル。

## When to Use

以下の状況で発動:

- try/catch を新規に書く時（外部依存呼び出し、async 境界、最上位 async ハンドラ）
- tRPC mutation/query に `onError` handler を追加する時
- 新規 ErrorBoundary を配置する時、または既存 ErrorBoundary の粒度を変える時
- Sentry 連携コード（`captureException` / scope / context 設定）を編集する時
- try/catch で `console.error` や生の `throw` のみで AppError 正規化が漏れている実装を検出した時
- ユーザー向けエラー通知（toast / modal / inline alert）が未実装の mutation / async 処理を見つけた時

## When NOT to Use

- 型定義のみの変更（エラーフロー未変更、`AppError` 型の export 追加など）
- テストの正常系 assertion 追加のみ（エラーパスを触らない）
- UI 文言のみの error message 修正（`CLAUDE.md` の copywriting ルールに従う、ロジック変更なし）

## エラー処理の全体像

```
エラー発生
    ↓
AppError に正規化
    ↓
┌─────────────────────────────────────┐
│  1. ログ出力（logger + Sentry）      │
│  2. ユーザー通知（toast/modal）      │
│  3. 自動復旧（retry/fallback）       │
│  4. メトリクス更新                   │
└─────────────────────────────────────┘
```

## グローバルエラーハンドラー

```typescript
import { handleError, handleWithRecovery } from '@/lib/errors';
import { ERROR_CODES } from '@/lib/errors/error-codes';

// シンプルなエラー処理
try {
  await riskyOperation();
} catch (error) {
  await handleError(error as Error, ERROR_CODES.UNEXPECTED_ERROR, {
    showUserNotification: true,
    source: 'component-name',
  });
}

// 自動復旧付き
const result = await handleWithRecovery(() => fetchData(), ERROR_CODES.API_TIMEOUT, {
  retryEnabled: true,
});

if (result.success) {
  // 成功（復旧含む）
  console.log(result.data);
} else {
  // 失敗
  console.error(result.error);
}
```

## エラーコード

主要なエラーコードは `@/lib/errors/error-codes` で定義：

| カテゴリ   | コード例                             | 用途       |
| ---------- | ------------------------------------ | ---------- |
| AUTH       | `INVALID_TOKEN`, `SESSION_EXPIRED`   | 認証エラー |
| API        | `API_TIMEOUT`, `RATE_LIMIT_EXCEEDED` | APIエラー  |
| DATABASE   | `CONNECTION_FAILED`, `DUPLICATE_KEY` | DBエラー   |
| VALIDATION | `REQUIRED_FIELD`, `INVALID_FORMAT`   | 入力エラー |

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

import { Component, ReactNode } from 'react';
import { handleError } from '@/lib/errors';
import { ERROR_CODES } from '@/lib/errors/error-codes';

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

  componentDidCatch(error: Error) {
    // グローバルエラーハンドラーに報告
    void handleError(error, ERROR_CODES.RENDER_ERROR, {
      source: 'ErrorBoundary',
      showUserNotification: false,
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

```typescript
// lib/sentry/integration.ts
import * as Sentry from '@sentry/nextjs';
import { AppError } from '@/lib/errors';

export function captureAppError(error: AppError) {
  Sentry.captureException(error, {
    tags: {
      category: error.category,
      code: error.code,
      severity: error.severity,
    },
    extra: {
      userMessage: error.userMessage,
      context: error.metadata?.context,
    },
    user: error.metadata?.userId ? { id: error.metadata.userId } : undefined,
  });
}

// エラー境界と組み合わせ
export function reportErrorToSentry(error: Error, componentStack?: string) {
  Sentry.captureException(error, {
    extra: { componentStack },
  });
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
apps/product/src/lib/errors/                  # エラーコード・パターン定義
apps/product/src/lib/sentry/             # Sentry連携（integration.ts, performance.ts, trace.ts）
apps/product/src/lib/trpc/errors.ts      # tRPCエラーハンドリング（handleServiceError）
apps/product/src/lib/tanstack-query/          # TanStack Queryキャッシュ・楽観的更新
```

## 関連スキル

- `/trpc-router-creating` - tRPCエラーコード
- `/security` - 認証エラー処理
