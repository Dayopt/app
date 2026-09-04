/**
 * Timeblock に対する操作メニューの items 定義（単一情報源）
 *
 * 右クリックメニュー（EventContextMenu）と Inspector の TagRow メニューが
 * 同じ項目セット・同じ表示条件を共有するための shared source。
 *
 * shell（floating button / Radix DropdownMenu）は呼び出し側が自前で持つ。
 * この関数は「どの項目をどの条件で出すか」だけを担う。
 */

import type { LucideIcon } from 'lucide-react';
import { BarChart3, CircleSlash, Copy, CopyPlus, RotateCcw, Trash2 } from 'lucide-react';

import type { MessageKey } from '@/lib/i18n';
import type { TimeblockOrigin } from '@/lib/time';

export type TimeblockMenuItemKey =
  'viewStats' | 'copy' | 'duplicate' | 'skip' | 'unskip' | 'delete';

export interface TimeblockMenuItem {
  key: TimeblockMenuItemKey;
  /** next-intl の translation key */
  labelKey: MessageKey;
  icon: LucideIcon;
  dangerous: boolean;
  onSelect: () => void;
}

interface TimeblockMenuItemsArgs {
  origin: TimeblockOrigin | undefined;
  activityId?: string | null | undefined;
  /** スキップ済み（skipped_at あり）か。skip / unskip の表示切替に使う */
  isSkipped?: boolean | undefined;
  onViewStats?: (() => void) | undefined;
  onCopy?: (() => void) | undefined;
  onDuplicate?: (() => void) | undefined;
  onSkip?: (() => void) | undefined;
  onUnskip?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}

export function getTimeblockMenuItems({
  origin,
  activityId,
  isSkipped = false,
  onViewStats,
  onCopy,
  onDuplicate,
  onSkip,
  onUnskip,
  onDelete,
}: TimeblockMenuItemsArgs): TimeblockMenuItem[] {
  const isPlanned = origin === 'planned';

  const items: (TimeblockMenuItem | null)[] = [
    onViewStats && activityId
      ? {
          key: 'viewStats',
          labelKey: 'calendar.filter.viewStats',
          icon: BarChart3,
          dangerous: false,
          onSelect: onViewStats,
        }
      : null,
    onCopy
      ? {
          key: 'copy',
          labelKey: 'common.actions.copy',
          icon: Copy,
          dangerous: false,
          onSelect: onCopy,
        }
      : null,
    onDuplicate
      ? {
          key: 'duplicate',
          labelKey: 'common.actions.duplicate',
          icon: CopyPlus,
          dangerous: false,
          onSelect: onDuplicate,
        }
      : null,
    onSkip && isPlanned && !isSkipped
      ? {
          key: 'skip',
          labelKey: 'timeblock.inspector.skip',
          icon: CircleSlash,
          dangerous: false,
          onSelect: onSkip,
        }
      : null,
    onUnskip && isPlanned && isSkipped
      ? {
          key: 'unskip',
          labelKey: 'timeblock.inspector.unskip',
          icon: RotateCcw,
          dangerous: false,
          onSelect: onUnskip,
        }
      : null,
    onDelete
      ? {
          key: 'delete',
          labelKey: 'common.actions.delete',
          icon: Trash2,
          dangerous: true,
          onSelect: onDelete,
        }
      : null,
  ];

  return items.filter((item): item is TimeblockMenuItem => item !== null);
}
