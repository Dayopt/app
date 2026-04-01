'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { formatHours } from '../../utils/formatHours';

interface MonthlyTrendChartProps {
  data: Array<{ month: string; hours: number }>;
}

/**
 * 月次トレンドを SVG 折れ線 + グラデーション塗りで表示（ライブラリ不使用）
 */
export function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  const t = useTranslations('calendar.stats.charts');

  if (data.length === 0) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle>{t('monthlyTrend')}</CardTitle>
          <CardDescription>{t('monthlyTrendDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            {t('noData')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxHours = Math.max(...data.map((d) => d.hours), 1);
  const totalHours = data.reduce((sum, d) => sum + d.hours, 0);
  const avgHours = data.length > 0 ? totalHours / data.length : 0;

  // SVG 座標
  const W = 300;
  const H = 120;
  const PAD_X = 10;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 24;

  const points = data.map((d, i) => ({
    x: PAD_X + (i / Math.max(data.length - 1, 1)) * (W - PAD_X * 2),
    y: PAD_TOP + (1 - d.hours / maxHours) * (H - PAD_TOP - PAD_BOTTOM),
    label: d.month.slice(-2),
    hours: d.hours,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const firstPoint = points[0]!;
  const lastPoint = points[points.length - 1]!;
  const fillPath = `M${firstPoint.x},${firstPoint.y} ${points.map((p) => `L${p.x},${p.y}`).join(' ')} L${lastPoint.x},${H - PAD_BOTTOM} L${firstPoint.x},${H - PAD_BOTTOM} Z`;

  let momText = '';
  if (data.length >= 2) {
    const last = data[data.length - 1]!.hours;
    const prev = data[data.length - 2]!.hours;
    if (prev > 0) {
      const change = ((last - prev) / prev) * 100;
      momText = t('monthlyMoM', { change: `${change > 0 ? '+' : ''}${change.toFixed(0)}%` });
    }
  }

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle>{t('monthlyTrend')}</CardTitle>
        <CardDescription>
          {t('monthlyAvg', { avg: formatHours(avgHours) })}
          {momText && ` ${momText}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('monthlyTrend')}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={fillPath} fill="url(#trendFill)" />
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--primary)">
              <title>{`${p.label}: ${formatHours(p.hours)}`}</title>
            </circle>
          ))}
          {points.map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={H - 4}
              textAnchor="middle"
              className="fill-muted-foreground text-xs"
            >
              {p.label}
            </text>
          ))}
        </svg>
        <div className="text-muted-foreground mt-2 text-center text-xs">
          {t('annualTotal', { total: formatHours(totalHours) })}
        </div>
      </CardContent>
    </Card>
  );
}
