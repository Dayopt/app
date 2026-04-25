import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SidebarSectionProps {
  /** セクションタイトル */
  title: string;
  /** セクションの子要素 */
  children: ReactNode;
  /** 追加のクラス名（コンテンツ部分） */
  className?: string;
  /** ヘッダーに表示するアクション（右端） */
  action?: ReactNode | undefined;
}

/** サイドバー共通のセクション。タイトル + 右端 action スロット + 常時表示の children。 */
export function SidebarSection({ title, children, className, action }: SidebarSectionProps) {
  return (
    <section className="w-full min-w-0 overflow-hidden">
      <div className="flex h-8 w-full items-center">
        <h3 className="text-muted-foreground min-w-0 truncate px-2 text-sm font-medium">{title}</h3>
        <span className="flex-1" />
        {action && <span className="shrink-0">{action}</span>}
      </div>
      <div className={cn('w-full min-w-0 overflow-hidden', className)}>{children}</div>
    </section>
  );
}
