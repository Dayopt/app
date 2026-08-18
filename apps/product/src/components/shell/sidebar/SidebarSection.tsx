import type { ReactNode } from 'react';

import { ChevronRight } from 'lucide-react';

import { cn } from '@dayopt/components';

interface SidebarSectionProps {
  /** セクションタイトル */
  title: string;
  /** セクションの子要素 */
  children: ReactNode;
  /** 追加のクラス名（コンテンツ部分） */
  className?: string;
  /** ヘッダーに表示するアクション（右端） */
  action?: ReactNode | undefined;
  /**
   * 見出しクリックで children を開閉する。
   * 渡した時だけ見出しがボタンになり chevron が付く（既存 consumer は無変更で従来表示）。
   */
  collapsed?: boolean | undefined;
  onToggleCollapse?: (() => void) | undefined;
}

/** サイドバー共通のセクション。タイトル + 右端 action スロット + children。 */
export function SidebarSection({
  title,
  children,
  className,
  action,
  collapsed,
  onToggleCollapse,
}: SidebarSectionProps) {
  const collapsible = onToggleCollapse !== undefined;

  return (
    <section className="w-full min-w-0 overflow-hidden">
      <div
        className={cn(
          'group/section flex h-8 w-full items-center rounded-lg',
          collapsible && 'hover:bg-state-hover cursor-pointer transition-colors duration-150',
        )}
        onClick={collapsible ? onToggleCollapse : undefined}
      >
        <h3 className="text-muted-foreground ml-2 min-w-0 truncate text-sm font-medium">{title}</h3>
        {collapsible && (
          // カテゴリー見出し（CategoryHeader）と同じ位置: タイトルの右に置く独立ボタン。
          // 行クリックへ波及させない（行自体も onToggleCollapse を持つため二重発火しうる）
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.();
            }}
            aria-label={title}
            aria-expanded={!collapsed}
            className={cn(
              // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素のヒットエリア拡張に before:content-[''] の空文字指定が必須
              "text-muted-foreground hover:text-foreground hover:bg-state-hover relative ml-1 flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity duration-150 before:absolute before:-inset-2 before:content-['']",
              // 展開中は行にカーソルが乗るまで隠す。畳んでいる間は常時表示（開き直す手段を隠さない）
              collapsed
                ? 'opacity-100'
                : 'opacity-0 transition-opacity group-focus-within/section:opacity-100 group-hover/section:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
            )}
          >
            <ChevronRight
              className={cn('size-4 transition-transform', !collapsed && 'rotate-90')}
              aria-hidden
            />
          </button>
        )}
        <span className="flex-1" />
        {action && (
          <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {action}
          </span>
        )}
      </div>
      {collapsed ? null : (
        <div className={cn('w-full min-w-0 overflow-hidden', className)}>{children}</div>
      )}
    </section>
  );
}
