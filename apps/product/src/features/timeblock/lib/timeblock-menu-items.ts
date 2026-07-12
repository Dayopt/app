/**
 * Entry に対する操作メニューの items 定義（単一情報源）
 *
 * 右クリックメニュー（EventContextMenu）と Inspector の TagRow メニューが
 * 同じ項目セット・同じ表示条件を共有するための shared source。
 *
 * shell（floating button / Radix DropdownMenu）は呼び出し側が自前で持つ。
 * この関数は「どの項目をどの条件で出すか」だけを担う。
 */

import type { LucideIcon } from 'lucide-react';
import { BarChart3, CalendarOff, CircleSlash, RotateCcw, Trash2 } from 'lucide-react';

import type { TimeblockOrigin } from '@dayopt/domain';

export type TimeblockMenuItemKey =
  'viewStats' | 'markUnplanned' | 'restorePlanned' | 'skip' | 'unskip' | 'delete';

export interface TimeblockMenuItem {
  key: TimeblockMenuItemKey;
  /** next-intl の translation key */
  labelKey: string;
  icon: LucideIcon;
  dangerous: boolean;
  onSelect: () => void;
}

interface EntryMenuItemsArgs {
  origin: TimeblockOrigin | undefined;
  tagId: string | null | undefined;
  /**
   * 未来（upcoming）の予定か。
   * 未来の予定はまだ記録が存在し得ないため「予定外にする」を表示しない。
   */
  isUpcoming?: boolean | undefined;
  /**
   * 過去（past: end_time <= now）の予定か。
   * skip はサーバーが過去の planned のみ許可する（active/未来は SKIP_IN_FUTURE 拒否）ため、
   * past の時だけ skip を出して「失敗するメニュー」を見せない。
   */
  isPast?: boolean | undefined;
  /** スキップ済み（skipped_at あり）か。skip / unskip の表示切替に使う */
  isSkipped?: boolean | undefined;
  onViewStats?: (() => void) | undefined;
  onMarkUnplanned?: (() => void) | undefined;
  onRestorePlanned?: (() => void) | undefined;
  onSkip?: (() => void) | undefined;
  onUnskip?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}

export function getTimeblockMenuItems({
  origin,
  tagId,
  isUpcoming = false,
  isPast = false,
  isSkipped = false,
  onViewStats,
  onMarkUnplanned,
  onRestorePlanned,
  onSkip,
  onUnskip,
  onDelete,
}: EntryMenuItemsArgs): TimeblockMenuItem[] {
  const isUnplanned = origin === 'unplanned';
  const isPlanned = origin === 'planned';

  const items: (TimeblockMenuItem | null)[] = [
    onViewStats && tagId
      ? {
          key: 'viewStats',
          labelKey: 'calendar.filter.viewStats',
          icon: BarChart3,
          dangerous: false,
          onSelect: onViewStats,
        }
      : null,
    onMarkUnplanned && isPlanned && !isUpcoming
      ? {
          key: 'markUnplanned',
          labelKey: 'entry.inspector.markUnplanned',
          icon: CalendarOff,
          dangerous: false,
          onSelect: onMarkUnplanned,
        }
      : null,
    onRestorePlanned && isUnplanned
      ? {
          key: 'restorePlanned',
          labelKey: 'entry.inspector.restorePlanned',
          icon: RotateCcw,
          dangerous: false,
          onSelect: onRestorePlanned,
        }
      : null,
    // 過去の planned のみスキップ可能（active/未来はサーバーが拒否するため出さない）
    onSkip && isPlanned && isPast && !isSkipped
      ? {
          key: 'skip',
          labelKey: 'entry.inspector.skip',
          icon: CircleSlash,
          dangerous: false,
          onSelect: onSkip,
        }
      : null,
    onUnskip && isPlanned && isSkipped
      ? {
          key: 'unskip',
          labelKey: 'entry.inspector.unskip',
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
