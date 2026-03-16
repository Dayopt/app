'use client';

import { useEffect, useRef, useState } from 'react';

import { Calendar, ClipboardCopy, Copy, Edit2, Link, Tag, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { CalendarEvent } from '../../../../types/calendar.types';

interface PlanContextMenuProps {
  plan: CalendarEvent;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit?: (plan: CalendarEvent) => void;
  onDelete?: (plan: CalendarEvent) => void;
  onDuplicate?: (plan: CalendarEvent) => void;
  onCopy?: (plan: CalendarEvent) => void;
  onCopyLink?: (plan: CalendarEvent) => void;
  onAddTag?: (plan: CalendarEvent) => void;
  onMoveToDate?: (plan: CalendarEvent) => void;
}

export const EventContextMenu = ({
  plan,
  position,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onCopy,
  onCopyLink,
  onAddTag,
  onMoveToDate,
}: PlanContextMenuProps) => {
  const t = useTranslations();
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // 画面外に出ないよう位置調整
  useEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let { x } = position;
      let { y } = position;

      // 右端を超える場合は左に表示
      if (x + rect.width > viewportWidth - 10) {
        x = Math.max(10, viewportWidth - rect.width - 10);
      }

      // 下端を超える場合は上に表示
      if (y + rect.height > viewportHeight - 10) {
        y = Math.max(10, viewportHeight - rect.height - 10);
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect -- DOM計測後のメニュー位置調整は不可避
      setAdjustedPosition({ x, y });
    }
  }, [position]);

  // 外部クリック時にメニューを閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const menuItems = [
    {
      icon: Edit2,
      label: t('calendar.contextMenu.edit'),
      action: () => onEdit?.(plan),
      available: !!onEdit,
    },
    {
      icon: Copy,
      label: t('calendar.contextMenu.duplicate'),
      action: () => onDuplicate?.(plan),
      available: !!onDuplicate,
    },
    {
      icon: ClipboardCopy,
      label: t('calendar.contextMenu.copy'),
      action: () => onCopy?.(plan),
      available: !!onCopy,
    },
    {
      icon: Link,
      label: t('calendar.contextMenu.copyLink'),
      action: () => onCopyLink?.(plan),
      available: !!onCopyLink,
    },
    {
      icon: Tag,
      label: t('calendar.contextMenu.addTag'),
      action: () => onAddTag?.(plan),
      available: !!onAddTag,
    },
    {
      icon: Calendar,
      label: t('calendar.contextMenu.moveToDate'),
      action: () => onMoveToDate?.(plan),
      available: !!onMoveToDate,
    },
    {
      icon: Trash2,
      label: t('calendar.contextMenu.delete'),
      action: () => onDelete?.(plan),
      available: !!onDelete,
      dangerous: true,
    },
  ].filter((item) => item.available);

  return (
    <div
      ref={menuRef}
      className="bg-card text-card-foreground border-border animate-in fade-in-0 zoom-in-95 fixed z-[350] min-w-[12rem] rounded-lg border p-1 shadow-lg motion-reduce:animate-none"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {menuItems.map((item) => {
        const IconComponent = item.icon;

        return (
          <button
            type="button"
            key={item.label}
            onClick={() => handleAction(item.action)}
            className={cn(
              'flex w-full cursor-default items-center gap-2 rounded px-2 py-2 text-left text-sm outline-hidden transition-colors select-none',
              "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              item.dangerous
                ? 'text-destructive hover:bg-destructive-state-hover focus:bg-destructive-state-hover'
                : "text-foreground hover:bg-state-hover focus:bg-state-focus [&_svg:not([class*='text-'])]:text-muted-foreground",
            )}
          >
            <IconComponent />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
