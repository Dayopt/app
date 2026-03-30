'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/platform/trpc';

const FULFILLMENT_EMOJI: Record<number, string> = {
  3: '😊',
  2: '😐',
  1: '😞',
};

interface TagRecentBlocksProps {
  tagId: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * タグの直近エントリ一覧
 *
 * 日付・時間・充実度・精度をコンパクトなテーブルで表示。
 */
export function TagRecentBlocks({ tagId }: TagRecentBlocksProps) {
  const t = useTranslations('calendar.stats.tagDetail');

  const { data, isPending } = api.entries.getTagRecentEntries.useQuery({
    tagId,
    limit: 8,
  });

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

  if (!data || data.length === 0) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('recentBlocks')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-16 items-center justify-center text-sm">
            {t('noEntries')}
          </div>
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
            const deviation =
              entry.plannedMinutes != null
                ? Math.round(entry.durationMinutes - entry.plannedMinutes)
                : null;

            return (
              <div
                key={entry.entryId}
                className="border-border flex items-center gap-3 py-2.5 not-last:border-b"
              >
                <span className="text-muted-foreground w-10 text-xs">
                  {formatDate(entry.startTime)}
                </span>
                <span className="text-foreground w-24 font-mono text-xs font-medium">
                  {formatTime(entry.startTime)}-{formatTime(entry.endTime)}
                </span>
                <span className="w-6 text-center text-base">
                  {entry.fulfillmentScore != null
                    ? (FULFILLMENT_EMOJI[entry.fulfillmentScore] ?? '')
                    : ''}
                </span>
                <span className="flex-1" />
                {deviation != null && (
                  <span
                    className={`font-mono text-xs font-semibold ${
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
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
