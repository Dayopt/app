'use client';

import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** タイトル */
  title: string;
  /** 説明文 */
  description?: string | undefined;
  /** アイコン（Lucideアイコンコンポーネント） */
  icon?: LucideIcon | undefined;
  /** アクションボタンのラベル */
  actionLabel?: string | undefined;
  /** アクションボタンのコールバック */
  onAction?: (() => void) | undefined;
  /** カスタムアクション（Buttonなど） */
  actions?: React.ReactNode | undefined;
  /** サイズ: sm=コンパクト, md=標準, lg=大きめ */
  size?: 'sm' | 'md' | 'lg' | undefined;
  /** 親要素内で中央配置 (業界標準: テーブル/カード内で使用時) */
  centered?: boolean | undefined;
  /** 追加のクラス名 */
  className?: string | undefined;
}

/**
 * EmptyStateコンポーネント（業界標準準拠）
 *
 * PatternFly/GitLab基準:
 * - centered=true: 親要素内で水平・垂直中央配置
 * - テーブル/カード内では centered + size="sm"
 * - フルページでは size="lg"
 *
 * @example
 * ```tsx
 * // テーブル内（中央配置）
 * <EmptyState
 *   icon={Inbox}
 *   title="No items"
 *   centered
 *   size="sm"
 * />
 *
 * // フルページ
 * <EmptyState
 *   icon={Inbox}
 *   title="No items"
 *   size="lg"
 * />
 * ```
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  actions,
  size = 'md',
  centered = false,
  className,
}: EmptyStateProps) {
  const sizeStyles = {
    sm: { icon: 'size-10', title: 'text-sm', desc: 'text-xs', gap: 'py-4' },
    md: { icon: 'size-12', title: 'text-base', desc: 'text-sm', gap: 'py-6' },
    lg: { icon: 'size-16', title: 'text-lg', desc: 'text-sm', gap: 'py-8' },
  };

  const s = sizeStyles[size];

  const content = (
    <div role="status" className={cn('text-center', s.gap, !centered && className)}>
      {Icon && (
        <div className="mb-4">
          <Icon className={cn(s.icon, 'text-muted-foreground mx-auto')} />
        </div>
      )}
      {title && <p className={cn('text-foreground font-normal', s.title)}>{title}</p>}
      {description && <p className={cn('text-muted-foreground mt-1', s.desc)}>{description}</p>}
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button onClick={onAction} size={size === 'sm' ? 'sm' : 'default'}>
            {actionLabel}
          </Button>
        </div>
      )}
      {actions && <div className="mt-4">{actions}</div>}
    </div>
  );

  // 中央配置: CSS Gridで安全に中央寄せ（Radix競合回避）
  if (centered) {
    return <div className={cn('grid h-full w-full place-items-center', className)}>{content}</div>;
  }

  return content;
}
