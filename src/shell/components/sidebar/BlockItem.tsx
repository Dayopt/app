'use client';

/**
 * BlockItem — ブロックアイテム（共通コンポーネント）
 *
 * タグカラードット + タグ名 + duration + ホバー時メニュー
 * クリックで現在時刻にエントリを配置。
 * Palette・RecentBlocks の両方で使用。
 */

import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

/** BlockItem の menuSlot 内ボタンに共通適用するクラス（ホバー時のみ表示） */
export const blockMenuButtonCn =
  'text-muted-foreground hover:text-foreground hover:bg-state-hover flex size-6 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover/block:opacity-100 [@media(hover:none)]:opacity-100';

interface BlockItemProps {
  tagName: string;
  tagColor: string | null;
  durationMinutes: number;
  onClick?: (() => void) | undefined;
  className?: string;
  /** メニュートリガーのスロット（DropdownMenu等を渡す） */
  menuSlot?: React.ReactNode;
  /** タグアイコンスロット（TagIconコンポーネントを渡す。未指定時は色ドット） */
  iconSlot?: React.ReactNode;
  /** ドットの表示バリアント: solid=塗り（デフォルト）, outline=中抜き */
  dotVariant?: 'solid' | 'outline';
  /** 無効状態（削除済みタグ等） */
  disabled?: boolean | undefined;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h${remainder}m` : `${hours}h`;
}

/** ブロックアイテム（タグカラードット + タグ名 + duration + ホバーメニュー） */
export function BlockItem({
  tagName,
  tagColor,
  durationMinutes,
  onClick,
  className,
  menuSlot,
  iconSlot,
  dotVariant = 'solid',
  disabled = false,
}: BlockItemProps) {
  const colorClasses = getTagColorClasses(tagColor);

  return (
    <div
      className={cn(
        'group/block flex h-8 w-full items-center rounded text-base transition-colors [@media(hover:none)]:h-11',
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
        {/* タグアイコン or カラードット */}
        {iconSlot ?? (
          <span
            className={cn(
              'shrink-0 rounded-full',
              dotVariant === 'outline' ? 'size-3 border-2 bg-transparent' : 'size-2.5',
              dotVariant === 'outline' ? colorClasses.border : colorClasses.dot,
            )}
            aria-hidden="true"
          />
        )}

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
