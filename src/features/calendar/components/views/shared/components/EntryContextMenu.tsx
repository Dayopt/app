'use client';

import { useEffect, useRef, useState } from 'react';

import { Palette, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { CalendarEvent } from '../../../../types/calendar.types';

interface EntryContextMenuProps {
  entry: CalendarEvent;
  position: { x: number; y: number };
  onClose: () => void;
  onAddToPalette?: ((entry: CalendarEvent) => void) | undefined;
  onDelete?: ((entry: CalendarEvent) => void) | undefined;
}

/** エントリの右クリックコンテキストメニューコンポーネント */
export const EventContextMenu = ({
  entry,
  position,
  onClose,
  onAddToPalette,
  onDelete,
}: EntryContextMenuProps) => {
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

  // メニューが開いたら最初の項目にフォーカス
  useEffect(() => {
    const timer = setTimeout(() => {
      const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // 外部クリック・Escape・Arrow keyナビゲーション
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        if (!items?.length) return;
        const currentIndex = Array.from(items).findIndex((el) => el === document.activeElement);
        const nextIndex =
          e.key === 'ArrowDown'
            ? (currentIndex + 1) % items.length
            : (currentIndex - 1 + items.length) % items.length;
        items[nextIndex]?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const menuItems = [
    {
      icon: Palette,
      label: t('calendar.contextMenu.addToPalette'),
      action: () => onAddToPalette?.(entry),
      available: !!onAddToPalette,
    },
    {
      icon: Trash2,
      label: t('calendar.contextMenu.delete'),
      action: () => onDelete?.(entry),
      available: !!onDelete,
      dangerous: true,
    },
  ].filter((item) => item.available);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('calendar.contextMenu.title')}
      className="bg-card text-card-foreground border-border-subtle animate-in fade-in-0 zoom-in-95 z-context-menu shadow-card fixed min-w-48 rounded-lg border p-1 motion-reduce:animate-none"
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
            role="menuitem"
            tabIndex={-1}
            key={item.label}
            onClick={() => handleAction(item.action)}
            className={cn(
              'flex w-full cursor-default items-center gap-2 rounded-lg px-2 py-2 text-left text-sm outline-hidden transition-colors select-none',
              "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              item.dangerous
                ? 'text-destructive hover:bg-destructive-state-hover focus:bg-destructive-state-hover'
                : "text-foreground hover:bg-state-hover focus:bg-state-hover [&_svg:not([class*='text-'])]:text-muted-foreground",
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
