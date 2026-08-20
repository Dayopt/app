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
    // overflow-hidden ではなく overflow-clip。見た目の切り落としは同じだが、
    // hidden はスクロール可能な箱になるため、44px タッチターゲット用の擬似要素が
    // はみ出していると、右端のボタンにフォーカスした瞬間にブラウザが
    // 「見える位置へ」と横スクロールし、見出しごと左へずれて文字が欠ける。
    // clip はスクロールコンテナを作らないのでこれが起きない
    <section className="w-full min-w-0 overflow-clip">
      <div
        className={cn(
          'group/section flex h-8 w-full items-center',
          collapsible && 'cursor-pointer',
        )}
        onClick={collapsible ? onToggleCollapse : undefined}
      >
        {/* 見出しテキスト + chevron を 1 つの hover 領域として囲う（#2249）。
            右側の action スロットは別のクリック対象なのでこのグループには含めない。 */}
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1 rounded-lg px-2 py-1',
            collapsible && 'hover:bg-state-hover',
          )}
        >
          <h3 className="text-muted-foreground min-w-0 truncate text-sm font-normal">{title}</h3>
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
                "text-muted-foreground hover:text-foreground relative flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity duration-150 before:absolute before:-inset-2 before:content-['']",
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
        </div>
        <span className="flex-1" />
        {action && (
          <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {action}
          </span>
        )}
      </div>
      {collapsed ? null : (
        <div className={cn('w-full min-w-0 overflow-clip', className)}>{children}</div>
      )}
    </section>
  );
}
