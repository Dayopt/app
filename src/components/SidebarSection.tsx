'use client';

import type { ReactNode } from 'react';

import { ChevronRight } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface SidebarSectionProps {
  /** セクションタイトル */
  title: string;
  /** セクションの子要素 */
  children: ReactNode;
  /** デフォルトで開いた状態にするか */
  defaultOpen?: boolean;
  /** 追加のクラス名（コンテンツ部分） */
  className?: string;
  /** ヘッダーに表示するアクション（開閉アイコンの左隣） */
  action?: ReactNode | undefined;
}

/**
 * SidebarSection - サイドバー共通セクションコンポーネント
 *
 * 全サイドバーで統一された折りたたみセクションを提供。
 *
 * **デザイン仕様（8pxグリッド準拠）**:
 * - ヘッダー高さ: 32px（h-8）
 * - 左右パディング: 8px（px-2）
 * - 上下パディング: 8px（py-2）
 * - ホバー: bg-state-hover（Material Design 3準拠）
 * - 角丸: rounded（4px - 内部小要素用）
 * - フォント: text-xs font-bold
 * - アイコン: 16px（size-4）、右端配置、開閉時90度回転
 *
 * @example
 * ```tsx
 * <SidebarSection title="マイカレンダー" defaultOpen>
 *   <FilterItem label="Plan" checked={true} />
 *   <FilterItem label="Record" checked={false} />
 * </SidebarSection>
 * ```
 */
export function SidebarSection({
  title,
  children,
  defaultOpen = false,
  className,
  action,
}: SidebarSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="w-full min-w-0 overflow-hidden">
      <CollapsibleTrigger asChild>
        <div className="hover:bg-state-hover flex h-8 w-full cursor-pointer items-center rounded transition-colors">
          <div className="text-muted-foreground flex h-8 min-w-0 items-center px-2 text-left text-xs font-bold">
            <span className="truncate">{title}</span>
            <ChevronRight className="ml-1 size-4 shrink-0 transition-transform [[data-state=open]_&]:rotate-90" />
          </div>
          <div className="flex-1" />
          {action && (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              {action}
            </div>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn('w-full min-w-0 overflow-hidden', className)}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
