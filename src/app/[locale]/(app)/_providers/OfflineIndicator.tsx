'use client';

import { useEffect, useRef, useState } from 'react';

import { formatDistanceToNow } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { WifiOff } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { useIsMutating } from '@tanstack/react-query';

import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';

const DATE_LOCALES = { en: enUS, ja } as const;

/**
 * オフライン状態インジケーター
 *
 * ネットワーク切断時に画面上部に穏やかなバナーを表示。
 * 最後の同期時刻を相対時間で表示し、1分ごとに更新。
 * 復帰時は自動的に非表示になり、pending mutationsの同期状況を通知。
 */
export function OfflineIndicator() {
  const t = useTranslations('common.sync');
  const locale = useLocale();
  const isOnline = useOnlineStatus();
  const wasOfflineRef = useRef(false);
  const mutatingCount = useIsMutating();
  const [lastOnlineAt, setLastOnlineAt] = useState<Date>(new Date());
  const [, setTick] = useState(0);

  // オンライン→オフライン遷移時に最後のオンライン時刻を記録
  useEffect(() => {
    if (!isOnline) {
      if (!wasOfflineRef.current) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- オンライン→オフライン遷移の記録はイベント駆動
        setLastOnlineAt(new Date());
      }
      wasOfflineRef.current = true;
      logger.warn('[OfflineIndicator] Network connection lost');
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      logger.info('[OfflineIndicator] Network connection restored');

      // 復帰時にpending mutationsがあれば同期通知
      if (mutatingCount > 0) {
        toast.success(t('pending', { count: mutatingCount }), {
          id: 'offline-sync',
        });
      }
    }
  }, [isOnline, mutatingCount, t]);

  // オフライン中、1分ごとに再レンダリングして相対時刻を更新
  useEffect(() => {
    if (isOnline) return;

    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 60_000);

    return () => clearInterval(interval);
  }, [isOnline]);

  if (isOnline) {
    return null;
  }

  const dateLocale = DATE_LOCALES[locale as keyof typeof DATE_LOCALES] ?? enUS;
  const lastSyncedTime = formatDistanceToNow(lastOnlineAt, {
    addSuffix: true,
    locale: dateLocale,
  });

  return (
    <div
      role="status"
      className="bg-muted text-muted-foreground flex items-center justify-center gap-2 px-4 py-2 text-center text-base md:text-sm"
    >
      <WifiOff className="size-4 shrink-0" />
      <span>
        {t('offline')}
        <span className="mx-1">&middot;</span>
        {t('lastSynced', { time: lastSyncedTime })}
      </span>
    </div>
  );
}
