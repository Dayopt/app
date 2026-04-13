'use client';

/**
 * BlockItem — ブロックアイテム（共通コンポーネント）
 *
 * タグアイコン + タグ名 + duration + ホバー時メニュー
 * クリックで現在時刻にエントリを配置。
 * Palette・RecentBlocks の両方で使用。
 */

import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { cn } from '@/lib/utils';

/** BlockItem の menuSlot 内ボタンに共通適用するクラス（ホバー時のみ表示） */
export const blockMenuButtonCn =
  'text-muted-foreground hover:text-foreground hover:bg-state-hover flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover/block:opacity-100 [@media(hover:none)]:opacity-100';

interface BlockItemProps {
  tagName: string;
  durationMinutes: number;
  onClick?: (() => void) | undefined;
  className?: string;
  /** メニュートリガーのスロット（DropdownMenu等を渡す） */
  menuSlot?: React.ReactNode;
  /** タグアイコンスロット（TagIconコンポーネントを渡す） */
  iconSlot: React.ReactNode;
  /** 無効状態（削除済みタグ等） */
  disabled?: boolean | undefined;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h${remainder}m` : `${hours}h`;
}

/** ブロックアイテム（タグアイコン + タグ名 + duration + ホバーメニュー） */
export function BlockItem({
  tagName,
  durationMinutes,
  onClick,
  className,
  menuSlot,
  iconSlot,
  disabled = false,
}: BlockItemProps) {
  return (
    <div
      className={cn(
        'group/block flex h-8 w-full items-center rounded-lg text-sm transition-colors [@media(hover:none)]:h-11 [@media(hover:none)]:text-base',
        disabled ? 'opacity-50' : 'hover:bg-state-hover',
        className,
      )}
    >
      {/* クリック領域（タグ名 + duration） */}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-block-action
        className="flex min-w-0 flex-1 items-center gap-2 px-2"
      >
        {iconSlot}

        {/* タグ名 */}
        <ColonTagLabel name={tagName} className="text-foreground min-w-0" />

        {/* duration（タグ名の隣） */}
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {formatDuration(durationMinutes)}
        </span>
      </button>

      {/* ホバー時メニュースロット */}
      {menuSlot}
    </div>
  );
}
