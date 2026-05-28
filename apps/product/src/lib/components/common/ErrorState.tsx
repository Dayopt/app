'use client';

import { AlertCircle, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@dayopt/ui';

import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  /** エラータイトル */
  title: string;
  /** エラー説明文 */
  description?: string | undefined;
  /** カスタムアイコン（デフォルト: AlertCircle） */
  icon?: LucideIcon | undefined;
  /** リトライコールバック */
  onRetry?: (() => void) | undefined;
  /** リトライボタンのカスタムラベル */
  retryLabel?: string | undefined;
  /** カスタムアクション（リトライボタンを置き換え） */
  actions?: React.ReactNode | undefined;
  /** サイズ: sm=カード内, md=標準, lg=フルページ */
  size?: 'sm' | 'md' | 'lg' | undefined;
  /** 親要素内で中央配置 */
  centered?: boolean | undefined;
  /** 追加のクラス名 */
  className?: string | undefined;
}

/**
 * インラインエラー状態コンポーネント
 *
 * tRPC クエリの isError 等、データ取得失敗時に使用。
 * ErrorBoundary（コンポーネントクラッシュ）や error.tsx（ページエラー）とは別レイヤー。
 *
 * @example
 * ```tsx
 * // カード内（中央配置）
 * <ErrorState
 *   title="データの読み込みに失敗しました"
 *   onRetry={() => refetch()}
 *   size="sm"
 *   centered
 * />
 *
 * // フルページ
 * <ErrorState
 *   title="統計の読み込みに失敗しました"
 *   description="しばらくしてからもう一度お試しください。"
 *   onRetry={() => refetch()}
 *   size="lg"
 * />
 * ```
 */
export function ErrorState({
  title,
  description,
  icon: Icon = AlertCircle,
  onRetry,
  retryLabel,
  actions,
  size = 'md',
  centered = false,
  className,
}: ErrorStateProps) {
  const t = useTranslations();

  const sizeStyles = {
    sm: { title: 'text-sm', desc: 'text-xs', gap: 'py-4' },
    md: { title: 'text-base', desc: 'text-sm', gap: 'py-6' },
    lg: { title: 'text-lg', desc: 'text-sm', gap: 'py-8' },
  };

  const s = sizeStyles[size];

  const content = (
    <div role="alert" className={cn('text-center', s.gap, !centered && className)}>
      <div className="mb-4">
        <Icon className="text-destructive mx-auto size-8" />
      </div>
      <p className={cn('text-foreground font-normal', s.title)}>{title}</p>
      {description && <p className={cn('text-muted-foreground mt-1', s.desc)}>{description}</p>}
      {onRetry && !actions && (
        <div className="mt-4">
          <Button variant="outline" size={size === 'sm' ? 'sm' : 'default'} onClick={onRetry}>
            {retryLabel ?? t('error.boundary.retry')}
          </Button>
        </div>
      )}
      {actions && <div className="mt-4">{actions}</div>}
    </div>
  );

  if (centered) {
    return <div className={cn('grid h-full w-full place-items-center', className)}>{content}</div>;
  }

  return content;
}
