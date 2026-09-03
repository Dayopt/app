import type { ReactNode } from 'react';

import { ChevronRight } from 'lucide-react';

import { cn } from '@dayopt/components';

import { SidebarIconButton } from './SidebarIconButton';

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
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- キーボード経路は内側の chevron button（aria-expanded 付き）が持つ。この onClick は見出し行のどこを押しても畳めるようにするマウス用の拡張 */}
      <div
        className={cn(
          'group/section flex h-8 w-full items-center',
          collapsible && 'cursor-pointer',
        )}
        onClick={collapsible ? onToggleCollapse : undefined}
      >
        {/* 見出しテキスト + chevron を 1 つの hover 領域として囲う（#2249）。
            flex-1 は付けない（残り幅は後続の spacer が吸収する既存の分担）。
            付けるとタイトルの短さに関係なく行の半分近くまで hover 領域が伸びる。
            右側の action スロットは別のクリック対象なのでこのグループには含めない。 */}
        <div
          className={cn(
            'flex min-w-0 items-center gap-1 rounded-lg px-2 py-1',
            collapsible && 'hover:bg-state-hover',
          )}
        >
          <h3 className="text-muted-foreground min-w-0 truncate text-sm font-normal">{title}</h3>
          {collapsible && (
            // カテゴリー見出し（CategoryHeader）と同じ位置: タイトルの右に置く独立ボタン。
            // 行クリックへ波及させない（行自体も onToggleCollapse を持つため二重発火しうる）
            <SidebarIconButton
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse?.();
              }}
              aria-label={title}
              aria-expanded={!collapsed}
              // 展開中は行にカーソルが乗るまで隠す。畳んでいる間は常時表示（開き直す手段を隠さない）
              {...(collapsed ? {} : { revealOn: 'section' as const })}
            >
              <ChevronRight
                className={cn('size-4 transition-transform', !collapsed && 'rotate-90')}
                aria-hidden
              />
            </SidebarIconButton>
          )}
        </div>
        <span className="flex-1" />
        {action && (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- 行の onClick へ波及させないための stopPropagation だけを持つ。この span 自体は操作対象ではなく、中身の action が自前の control を持つ
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
