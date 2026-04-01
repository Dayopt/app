import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface InfoBoxProps {
  variant?: 'default' | 'destructive';
  className?: string;
  children: ReactNode;
}

/**
 * 情報ボックスコンポーネント
 *
 * 設定画面のインフォメーション・警告表示に使用。
 * - default: bg-muted（案内・ヒント）
 * - destructive: destructive背景 + ボーダー（警告・エラー）
 */
export function InfoBox({ variant = 'default', className, children }: InfoBoxProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-4',
        variant === 'default' && 'bg-muted',
        variant === 'destructive' && 'border-destructive bg-destructive-state-hover border',
        className,
      )}
    >
      {children}
    </div>
  );
}
