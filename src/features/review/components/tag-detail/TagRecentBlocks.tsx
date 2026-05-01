'use client';

import { Clock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { EmptyState } from '@/lib/components/common/EmptyState';
import { ErrorState } from '@/lib/components/common/ErrorState';
import { Button } from '@/lib/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/lib/components/ui/card';
import { Skeleton } from '@/lib/components/ui/skeleton';
import { Spinner } from '@/lib/components/ui/spinner';
import { formatDateShort, formatDurationMinutes, formatTimeRange } from '@/lib/date';

import { useTagRecentEntries } from '../../hooks/useTagDetailData';

const FULFILLMENT_EMOJI: Record<number, string> = {
  3: '😊',
  2: '😐',
  1: '😞',
};

interface TagRecentBlocksProps {
  tagId: string;
}

/**
 * タグのエントリ一覧（リッチリスト + ページネーション）
 *
 * entries.list エンドポイントを tagId フィルタ付きで使用。
 * 「もっと見る」ボタンで追加読み込み。
 */
export function TagRecentBlocks({ tagId }: TagRecentBlocksProps) {
  const t = useTranslations('calendar.stats.tagDetail');
  const locale = useLocale();

  const { data, isPending, isFetching, isError, refetch, hasMore, loadMore } =
    useTagRecentEntries(tagId);

  if (isPending) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('recentBlocks')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('recentBlocks')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorState title={t('errorTitle')} onRetry={() => refetch()} size="sm" centered />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('recentBlocks')}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={Clock} title={t('noEntries')} size="sm" centered />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle className="text-sm">{t('recentBlocks')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          {data.map((entry) => {
            const startDate = entry.start_time ? new Date(entry.start_time) : null;
            const endDate = entry.end_time ? new Date(entry.end_time) : null;

            const durationMinutes =
              startDate && endDate
                ? Math.round((endDate.getTime() - startDate.getTime()) / 60000)
                : null;

            const deviation =
              entry.duration_minutes != null && durationMinutes != null
                ? Math.round(durationMinutes - entry.duration_minutes)
                : null;

            return (
              <div
                key={entry.id}
                className="border-border hover:bg-muted/50 flex flex-col gap-1 rounded-lg px-2 py-4 transition-colors duration-150 not-last:border-b"
              >
                {/* 日付 */}
                <span className="text-muted-foreground text-xs">
                  {startDate ? formatDateShort(startDate, locale) : ''}
                </span>

                {/* タイトル + 充実度 */}
                <div className="flex items-center gap-2">
                  <span className="text-foreground line-clamp-1 flex-1 text-sm">
                    {entry.title || t('untitled')}
                  </span>
                  {entry.fulfillment_score != null && (
                    <span className="shrink-0 text-base">
                      {FULFILLMENT_EMOJI[entry.fulfillment_score] ?? ''}
                    </span>
                  )}
                </div>

                {/* 時間帯 + 所要時間 + 誤差 */}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-xs">
                    {startDate && endDate ? formatTimeRange(startDate, endDate) : ''}
                  </span>
                  {durationMinutes != null && durationMinutes > 0 && (
                    <>
                      <span className="text-muted-foreground text-xs">·</span>
                      <span className="text-muted-foreground text-xs">
                        {formatDurationMinutes(durationMinutes)}
                      </span>
                    </>
                  )}
                  <span className="flex-1" />
                  {deviation != null && (
                    <span
                      className={`font-mono text-xs font-medium ${
                        Math.abs(deviation) <= 5
                          ? 'text-success'
                          : deviation > 0
                            ? 'text-warning'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {deviation > 0 ? '+' : ''}
                      {deviation}m
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* もっと見るボタン */}
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={isFetching}>
              {isFetching ? <Spinner size="sm" className="mr-2" /> : null}
              {t('loadMore')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
