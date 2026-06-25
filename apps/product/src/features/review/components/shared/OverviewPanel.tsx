'use client';

import type { ReactNode } from 'react';

import { cn } from '@dayopt/components';

/**
 * OverviewPanel — 粒度ビュー共通のセクションパネル
 *
 * アイコン + タイトル + 説明のヘッダーを持つカード。
 * `action` に Tier 3 の軽い導線（ghost リンク等）を 1 つだけ置ける。
 */
export function OverviewPanel({
  title,
  description,
  icon,
  action,
  className,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('border-border-subtle bg-card rounded-lg border p-4', className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="bg-secondary text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-foreground text-base font-medium">{title}</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
