'use client';

import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { AlertTriangle, Bell, Brain, Lightbulb, Sparkles, Trash2, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { NotificationType } from '../schemas';

interface NotificationItemProps {
  id: string;
  type: NotificationType;
  entryTitle?: string | undefined;
  isRead: boolean;
  createdAt: string;
  locale: 'ja' | 'en';
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  isDeleting?: boolean;
}

const typeIcons: Record<NotificationType, React.ReactNode> = {
  reminder: <Bell className="h-4 w-4" />,
  overdue: <AlertTriangle className="h-4 w-4" />,
  ai_insight: <Lightbulb className="h-4 w-4" />,
  weekly_report: <Sparkles className="h-4 w-4" />,
  burnout_warning: <Brain className="h-4 w-4" />,
  energy_insight: <Zap className="h-4 w-4" />,
};

const typeColors: Record<NotificationType, string> = {
  reminder: 'text-primary',
  overdue: 'text-warning',
  ai_insight: 'text-primary',
  weekly_report: 'text-primary',
  burnout_warning: 'text-warning',
  energy_insight: 'text-primary',
};

/** 通知1件を表示するリストアイテム（既読化・削除ボタン付き） */
export function NotificationItem({
  id,
  type,
  entryTitle,
  isRead,
  createdAt,
  locale,
  onMarkAsRead,
  onDelete,
  isDeleting,
}: NotificationItemProps) {
  const t = useTranslations();
  const dateLocale = locale === 'ja' ? ja : enUS;

  const formatTime = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: dateLocale });
    } catch {
      return timestamp;
    }
  };

  const handleClick = () => {
    if (!isRead) {
      onMarkAsRead(id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="group hover:bg-state-hover rounded-2xl px-4 py-2 transition-colors"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={!isRead ? 'button' : undefined}
      tabIndex={!isRead ? 0 : undefined}
    >
      <div className="flex items-start gap-2">
        {/* アイコン */}
        <div className={`mt-1 shrink-0 ${typeColors[type]}`}>{typeIcons[type]}</div>

        {/* コンテンツ */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4
              className={`truncate text-sm ${
                !isRead ? 'text-foreground font-medium' : 'text-muted-foreground font-normal'
              }`}
            >
              {entryTitle ?? type}
            </h4>
            {!isRead && (
              <span className="bg-primary size-2 shrink-0 rounded-full" aria-label="Unread" />
            )}
          </div>
          <span className="text-muted-foreground mt-1 block text-xs">{formatTime(createdAt)}</span>
        </div>

        {/* 削除ボタン（hover時のみ表示） */}
        <Button
          variant="ghost"
          size="sm"
          icon
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label={t('notification.deleteNotification')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(id);
          }}
          disabled={isDeleting}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
