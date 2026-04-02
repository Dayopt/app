'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SectionCardProps {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

/**
 * 設定セクションコンポーネント
 *
 * セクション間はborder-bセパレータで区切るフラットスタイル。
 * 現在は主に Settings / Chronotype の設定系UIで使用。
 * DAG上 settings (Cross-cutting) と chronotype (Layer 0) の共通依存先として common/ に配置。
 */
export function SectionCard({ title, children, className, actions }: SectionCardProps) {
  return (
    <section
      className={cn('border-border text-foreground border-b pb-6 last:border-b-0', className)}
    >
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between">
          {title ? (
            <h2 className="text-muted-foreground text-sm font-bold tracking-wide uppercase">
              {title}
            </h2>
          ) : (
            <div />
          )}
          {actions ? <div className="flex flex-shrink-0 items-center gap-4">{actions}</div> : null}
        </div>
      )}
      <div className="text-base">{children}</div>
    </section>
  );
}
