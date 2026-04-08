'use client';

import { FileSpreadsheet } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { formatMinutesDuration, getAccuracyColors } from '../timePL.utils';

import type { TimePLBreakEvenData, TimePLDailyPoint } from './timePLBreakEven.types';

interface TimePLBreakEvenProps {
  data: TimePLBreakEvenData | null;
  className?: string;
}

/**
 * 損益分岐点グラフ — 累積予算 vs 累積実績の推移
 *
 * 予算ラインと実績ラインの交差（損益分岐点）を可視化。
 * 2本のラインの間のエリアを色分け:
 * - 実績 < 予算 → 余裕ゾーン（薄いsuccess）
 * - 実績 > 予算 → 超過ゾーン（薄いdestructive）
 */
export function TimePLBreakEven({ data, className }: TimePLBreakEvenProps) {
  if (!data || data.points.length === 0) {
    return (
      <Card className={cn('gap-0 border-none py-0', className)}>
        <CardContent className="p-4">
          <EmptyState
            icon={FileSpreadsheet}
            title="まっさらな期間です"
            description="予定と記録が増えると、損益分岐点が見えてきます"
            size="sm"
            centered
          />
        </CardContent>
      </Card>
    );
  }

  const colors = getAccuracyColors(data.accuracyStatus);
  const { points } = data;

  // SVG viewBox
  const chartW = 400;
  const chartH = 200;
  const padTop = 24;
  const padBottom = 4;
  const padLeft = 4;
  const padRight = 4;
  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  // スケール
  const maxMinutes = Math.max(
    ...points.map((p) => Math.max(p.cumulativeBudget, p.cumulativeActual)),
    1,
  );
  const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;

  function toX(i: number): number {
    return padLeft + i * xStep;
  }
  function toY(minutes: number): number {
    return padTop + plotH - (minutes / maxMinutes) * plotH;
  }

  // ライン生成
  const budgetLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p.cumulativeBudget)}`)
    .join(' ');
  const actualLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p.cumulativeActual)}`)
    .join(' ');

  // エリア塗りつぶし用のセグメント生成
  const areaSegments = buildAreaSegments(points, toX, toY);

  // 損益分岐点の位置
  const bePoint = data.breakEvenIndex !== null ? data.breakEvenIndex : null;

  return (
    <Card className={cn('gap-0 border-none py-0', className)}>
      <CardHeader className="flex items-start justify-between p-4 pb-0">
        <div>
          <h3 className="text-foreground text-sm font-medium">損益分岐点</h3>
          <p className="text-muted-foreground text-xs">{data.period.label}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            colors.bg,
            colors.text,
          )}
        >
          {Math.round(data.accuracyRate * 100)}%
        </span>
      </CardHeader>

      <CardContent className="px-4 pt-4 pb-4">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" aria-label="損益分岐点グラフ">
          {/* エリア塗りつぶし */}
          {areaSegments.map((seg, i) => (
            <path
              key={i}
              d={seg.path}
              className={seg.isOver ? 'fill-destructive/10' : 'fill-success/10'}
            />
          ))}

          {/* グリッド線 */}
          {[0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1={padLeft}
              y1={toY(maxMinutes * ratio)}
              x2={chartW - padRight}
              y2={toY(maxMinutes * ratio)}
              className="stroke-border"
              strokeWidth={0.5}
              strokeDasharray="4 4"
            />
          ))}

          {/* 予算ライン */}
          <path
            d={budgetLine}
            fill="none"
            className="stroke-muted-foreground"
            strokeWidth={2}
            strokeDasharray="6 3"
          />

          {/* 実績ライン */}
          <path d={actualLine} fill="none" className="stroke-primary" strokeWidth={2.5} />

          {/* データポイント（予算） */}
          {points.map((p, i) => (
            <circle
              key={`b-${i}`}
              cx={toX(i)}
              cy={toY(p.cumulativeBudget)}
              r={2.5}
              className="fill-muted-foreground"
            />
          ))}

          {/* データポイント（実績） */}
          {points.map((p, i) => (
            <circle
              key={`a-${i}`}
              cx={toX(i)}
              cy={toY(p.cumulativeActual)}
              r={3}
              className="fill-primary"
            />
          ))}

          {/* 損益分岐点マーカー */}
          {bePoint !== null && (
            <>
              <circle
                cx={toX(bePoint)}
                cy={toY(points[bePoint]!.cumulativeActual)}
                r={6}
                className="fill-warning/30 stroke-warning"
                strokeWidth={2}
              />
              <text
                x={toX(bePoint)}
                y={toY(points[bePoint]!.cumulativeActual) - 10}
                textAnchor="middle"
                className="fill-warning font-medium"
                style={{ fontSize: 10 }}
              >
                BEP
              </text>
            </>
          )}

          {/* Y軸ラベル（最大値） */}
          <text
            x={padLeft + 2}
            y={padTop - 4}
            className="fill-muted-foreground"
            style={{ fontSize: 10 }}
          >
            {formatMinutesDuration(maxMinutes)}
          </text>

          {/* 開始・終了の累積値ラベル */}
          {points.length > 0 && (
            <>
              <text
                x={toX(points.length - 1) + 2}
                y={toY(points[points.length - 1]!.cumulativeBudget) - 4}
                className="fill-muted-foreground"
                style={{ fontSize: 9 }}
              >
                {formatMinutesDuration(data.budgetTotal)}
              </text>
              <text
                x={toX(points.length - 1) + 2}
                y={toY(points[points.length - 1]!.cumulativeActual) + 12}
                className="fill-primary font-medium"
                style={{ fontSize: 9 }}
              >
                {formatMinutesDuration(data.actualTotal)}
              </text>
            </>
          )}
        </svg>

        {/* X軸ラベル */}
        <div className="flex" style={{ paddingLeft: padLeft, paddingRight: padRight }}>
          {points.map((p, i) => (
            <div
              key={i}
              className="text-center"
              style={{
                width: i === 0 || i === points.length - 1 ? undefined : `${xStep}px`,
                flex: i === 0 || i === points.length - 1 ? undefined : '1',
              }}
            >
              <span className="text-muted-foreground text-xs">{p.label}</span>
            </div>
          ))}
        </div>

        {/* 凡例 */}
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <span
              className="bg-muted-foreground inline-block h-0.5 w-4"
              style={{ borderTop: '2px dashed' }}
            />
            予算
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <span className="bg-primary inline-block h-0.5 w-4 rounded-full" />
            実績
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <span className="bg-success/20 inline-block size-2 rounded-full" />
            余裕
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <span className="bg-destructive/20 inline-block size-2 rounded-full" />
            超過
          </span>
          {bePoint !== null && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <span className="bg-warning inline-block size-2 rounded-full" />
              分岐点
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Internal ──

interface AreaSegment {
  path: string;
  /** true = actual > budget（超過ゾーン） */
  isOver: boolean;
}

/**
 * 予算と実績の間のエリアをセグメントに分割。
 * 交差するたびにセグメントを切り替え、色分けする。
 */
function buildAreaSegments(
  points: TimePLDailyPoint[],
  toX: (i: number) => number,
  toY: (minutes: number) => number,
): AreaSegment[] {
  if (points.length < 2) return [];

  const segments: AreaSegment[] = [];
  let segStart = 0;

  for (let i = 1; i < points.length; i++) {
    const prevDiff = points[i - 1]!.cumulativeActual - points[i - 1]!.cumulativeBudget;
    const currDiff = points[i]!.cumulativeActual - points[i]!.cumulativeBudget;

    // 符号が変わった or 最後のポイント → セグメント確定
    const crossed = prevDiff * currDiff < 0;
    const isLast = i === points.length - 1;

    if (crossed || isLast) {
      const end = isLast && !crossed ? i : i;
      const isOver = points[segStart]!.cumulativeActual > points[segStart]!.cumulativeBudget;

      // Forward path (budget line) + reverse path (actual line)
      const forward = [];
      const reverse = [];
      for (let j = segStart; j <= end; j++) {
        forward.push(`${j === segStart ? 'M' : 'L'}${toX(j)},${toY(points[j]!.cumulativeBudget)}`);
        reverse.unshift(`L${toX(j)},${toY(points[j]!.cumulativeActual)}`);
      }

      segments.push({
        path: `${forward.join(' ')} ${reverse.join(' ')} Z`,
        isOver,
      });

      if (crossed) {
        segStart = i - 1;
        // 交差後の残りも処理（再帰的ではなく次のループで処理）
        if (!isLast) {
          segStart = i;
          // 交差点自体をセグメント（三角形的に）
          const crossIsOver = currDiff > 0;
          segments.push({
            path: `M${toX(i - 1)},${toY(points[i - 1]!.cumulativeBudget)} L${toX(i)},${toY(points[i]!.cumulativeBudget)} L${toX(i)},${toY(points[i]!.cumulativeActual)} L${toX(i - 1)},${toY(points[i - 1]!.cumulativeActual)} Z`,
            isOver: crossIsOver,
          });
        }
      }
    }
  }

  // セグメントが空の場合（交差なし）
  if (segments.length === 0 && points.length >= 2) {
    const isOver = points[0]!.cumulativeActual > points[0]!.cumulativeBudget;
    const forward = points.map(
      (p, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p.cumulativeBudget)}`,
    );
    const reverse = [...points]
      .reverse()
      .map((p, ri) => `L${toX(points.length - 1 - ri)},${toY(p.cumulativeActual)}`);
    segments.push({
      path: `${forward.join(' ')} ${reverse.join(' ')} Z`,
      isOver,
    });
  }

  return segments;
}
