'use client';

/**
 * PaletteItem — パレット内の個別ブロック
 *
 * タグカラードット + タグ名 + durationバッジ
 * クリックで現在時刻にエントリを配置
 */

import { Pin } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { HoverTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PaletteItemProps {
  tagName: string;
  tagColor: string | null;
  durationMinutes: number;
  isPinned: boolean;
  onClick: () => void;
  className?: string;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h${remainder}m` : `${hours}h`;
}

/** パレットアイテム（タグカラードット + タグ名 + duration） */
export function PaletteItem({
  tagName,
  tagColor,
  durationMinutes,
  isPinned,
  onClick,
  className,
}: PaletteItemProps) {
  const t = useTranslations();

  return (
    <HoverTooltip content={t('sidebar.palette.addToNow')} side="right">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'hover:bg-state-hover flex h-8 w-full items-center gap-2 rounded px-2 text-sm transition-colors',
          className,
        )}
      >
        {/* タグカラードット */}
        <span
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            tagColor ? `bg-tag-${tagColor}` : 'bg-muted',
          )}
          aria-hidden="true"
        />

        {/* タグ名 */}
        <span className="text-foreground min-w-0 truncate">{tagName}</span>

        {/* ピンアイコン */}
        {isPinned && <Pin className="text-muted-foreground size-3 shrink-0" aria-hidden="true" />}

        {/* duration バッジ */}
        <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
          {formatDuration(durationMinutes)}
        </span>
      </button>
    </HoverTooltip>
  );
}
