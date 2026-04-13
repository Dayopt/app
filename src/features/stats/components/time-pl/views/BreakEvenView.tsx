'use client';

import { formatMinutesDuration } from '../data/timePL.derivers';

import type { BreakEvenCurve } from '../data/timePL.types';

interface BreakEvenViewProps {
  curve: BreakEvenCurve;
}

/**
 * 損益分岐点グラフ — 累積予算 vs 累積実績の推移
 *
 * SVG ベースのラインチャート。交差点に BEP マーカー。
 * エリア塗りつぶし: 余裕（success）/ 超過（destructive）
 */
export function BreakEvenView({ curve }: BreakEvenViewProps) {
  const { points, breakEvenIndex: bePoint } = curve;

  const chartW = 400;
  const chartH = 200;
  const padTop = 24;
  const padBottom = 4;
  const padLeft = 4;
  const padRight = 4;
  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  const maxMinutes = Math.max(
    ...points.map((p) => Math.max(p.cumulativeBudget, p.cumulativeActual)),
    1,
  );
  const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;

  const toX = (i: number) => padLeft + i * xStep;
  const toY = (minutes: number) => padTop + plotH - (minutes / maxMinutes) * plotH;

  const budgetLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p.cumulativeBudget)}`)
    .join(' ');
  const actualLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p.cumulativeActual)}`)
    .join(' ');

  const areaSegments = buildAreaSegments(points, toX, toY);

  return (
    <div>
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

        {/* 予算ライン（破線） */}
        <path
          d={budgetLine}
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth={2}
          strokeDasharray="6 3"
        />
        {/* 実績ライン */}
        <path d={actualLine} fill="none" className="stroke-primary" strokeWidth={2.5} />

        {/* データポイント */}
        {points.map((p, i) => (
          <circle
            key={`b-${i}`}
            cx={toX(i)}
            cy={toY(p.cumulativeBudget)}
            r={2.5}
            className="fill-muted-foreground"
          />
        ))}
        {points.map((p, i) => (
          <circle
            key={`a-${i}`}
            cx={toX(i)}
            cy={toY(p.cumulativeActual)}
            r={3}
            className="fill-primary"
          />
        ))}

        {/* BEP マーカー */}
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

        {/* Y軸ラベル */}
        <text
          x={padLeft + 2}
          y={padTop - 4}
          className="fill-muted-foreground"
          style={{ fontSize: 10 }}
        >
          {formatMinutesDuration(maxMinutes)}
        </text>

        {/* 終点ラベル */}
        {points.length > 0 && (
          <>
            <text
              x={toX(points.length - 1) + 2}
              y={toY(points[points.length - 1]!.cumulativeBudget) - 4}
              className="fill-muted-foreground"
              style={{ fontSize: 9 }}
            >
              {formatMinutesDuration(curve.budgetTotal)}
            </text>
            <text
              x={toX(points.length - 1) + 2}
              y={toY(points[points.length - 1]!.cumulativeActual) + 12}
              className="fill-primary font-medium"
              style={{ fontSize: 9 }}
            >
              {formatMinutesDuration(curve.actualTotal)}
            </text>
          </>
        )}
      </svg>

      {/* X軸ラベル */}
      <div className="flex" style={{ paddingLeft: padLeft, paddingRight: padRight }}>
        {points.map((p, i) => (
          <div key={i} className="min-w-0 flex-1 text-center">
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
    </div>
  );
}

// ── Internal ──

interface AreaSegment {
  path: string;
  isOver: boolean;
}

function buildAreaSegments(
  points: BreakEvenCurve['points'],
  toX: (i: number) => number,
  toY: (m: number) => number,
): AreaSegment[] {
  if (points.length < 2) return [];

  const segments: AreaSegment[] = [];
  let segStart = 0;

  for (let i = 1; i < points.length; i++) {
    const prevDiff = points[i - 1]!.cumulativeActual - points[i - 1]!.cumulativeBudget;
    const currDiff = points[i]!.cumulativeActual - points[i]!.cumulativeBudget;
    const crossed = prevDiff * currDiff < 0;
    const isLast = i === points.length - 1;

    if (crossed || isLast) {
      const end = i;
      const isOver = points[segStart]!.cumulativeActual > points[segStart]!.cumulativeBudget;
      const forward = [];
      const reverse = [];
      for (let j = segStart; j <= end; j++) {
        forward.push(`${j === segStart ? 'M' : 'L'}${toX(j)},${toY(points[j]!.cumulativeBudget)}`);
        reverse.unshift(`L${toX(j)},${toY(points[j]!.cumulativeActual)}`);
      }
      segments.push({ path: `${forward.join(' ')} ${reverse.join(' ')} Z`, isOver });

      if (crossed && !isLast) {
        segStart = i;
        const crossIsOver = currDiff > 0;
        segments.push({
          path: `M${toX(i - 1)},${toY(points[i - 1]!.cumulativeBudget)} L${toX(i)},${toY(points[i]!.cumulativeBudget)} L${toX(i)},${toY(points[i]!.cumulativeActual)} L${toX(i - 1)},${toY(points[i - 1]!.cumulativeActual)} Z`,
          isOver: crossIsOver,
        });
      }
    }
  }

  if (segments.length === 0 && points.length >= 2) {
    const isOver = points[0]!.cumulativeActual > points[0]!.cumulativeBudget;
    const forward = points.map(
      (p, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p.cumulativeBudget)}`,
    );
    const reverse = [...points]
      .reverse()
      .map((p, ri) => `L${toX(points.length - 1 - ri)},${toY(p.cumulativeActual)}`);
    segments.push({ path: `${forward.join(' ')} ${reverse.join(' ')} Z`, isOver });
  }

  return segments;
}
