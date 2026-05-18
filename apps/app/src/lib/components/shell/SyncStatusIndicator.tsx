'use client';

import { AlertTriangle, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useSyncStatus } from '@/lib/hooks/useSyncStatus';

/**
 * 同期状態インジケーター
 *
 * オフライン / 同期待ち / 同期失敗をユーザーに表示する。
 * 全てが正常な場合（オンライン + pending 0）は何も表示しない。
 */
export function SyncStatusIndicator() {
  const t = useTranslations('common.sync');
  const { isOnline, pendingCount, failedCount, isSyncing, clearFailed } = useSyncStatus();

  // 全て正常 → 非表示
  if (isOnline && pendingCount === 0 && failedCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* オフライン表示 */}
      {!isOnline && (
        <div className="text-muted-foreground flex items-center gap-1">
          <CloudOff className="h-3.5 w-3.5" />
          <span>{t('offline')}</span>
        </div>
      )}

      {/* 同期待ち表示 */}
      {pendingCount > 0 && (
        <div className="text-muted-foreground flex items-center gap-1">
          {isSyncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Cloud className="h-3.5 w-3.5" />
          )}
          <span>{t('pending', { count: pendingCount })}</span>
        </div>
      )}

      {/* 同期失敗表示 */}
      {failedCount > 0 && (
        <div className="text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{t('failed', { count: failedCount })}</span>
          <button
            type="button"
            onClick={clearFailed}
            className="text-muted-foreground hover:text-foreground underline transition-colors"
          >
            {t('clearFailed')}
          </button>
        </div>
      )}
    </div>
  );
}
