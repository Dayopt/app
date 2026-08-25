'use client';

import { ActivityIcon, getCategoryColorClasses } from '@/features/activities';
import { cn } from '@dayopt/components';

import type { TemplateBlockMock } from './types';

interface MiniDayPreviewProps {
  blocks: ReadonlyArray<TemplateBlockMock>;
  className?: string | undefined;
}

/** アイコンを表示するには狭すぎるブロックの高さ閾値（px） */
const ICON_HEIGHT_THRESHOLD = 20;

/**
 * テンプレートのホバープレビュー用ミニチュア日ビュー（v1.0 §5.4）。
 *
 * 時刻ラベルは一切出さない。組成・順序・錨位置だけから相対的な縦位置と
 * 長さを描画する非対話コンポーネント（クリック・ドラッグ・右クリックを
 * 持たない静的な表示専用パーツ）。
 *
 * ブロックの視覚文法は `PlanLaneCard`（枠線 + カテゴリー色）を踏襲するが、
 * 時刻軸描画・ドラッグ・リサイズなど実データ連携が要る機構は持ち込まない。
 */
export function MiniDayPreview({ blocks, className }: MiniDayPreviewProps) {
  return (
    <div
      data-mini-day-preview
      className={cn(
        'bg-container border-border relative h-full w-full rounded-lg border',
        className,
      )}
      aria-hidden="true"
    >
      {blocks.map((block) => {
        const colorClasses = block.categoryColor
          ? getCategoryColorClasses(block.categoryColor)
          : null;
        const topPercent = block.anchorRatio * 100;
        const heightPercent = Math.max(block.medianDurationRatio * 100, 4);
        // 高さは相対値なので、実際の px 換算は親コンテナの高さに依存する。
        // アイコン表示可否の判定は「親の実測 px」までは Storybook mock では
        // 持たないため、比率が一定以上のブロックだけアイコンを出す簡易判定にする。
        const showIcon = heightPercent >= ICON_HEIGHT_THRESHOLD;

        return (
          <div
            key={block.id}
            className={cn(
              'absolute right-1 left-1 overflow-hidden rounded-lg border px-2 py-1',
              colorClasses?.border ?? 'border-border',
              colorClasses?.tint ?? 'bg-muted',
            )}
            style={{
              top: `${topPercent}%`,
              height: `${heightPercent}%`,
            }}
          >
            {showIcon && (
              <div className="flex items-center gap-1">
                <ActivityIcon
                  icon={block.categoryIcon}
                  color={block.categoryColor}
                  size="sm"
                  className="shrink-0"
                  neutral={block.categoryColor === null}
                />
                <span className="text-foreground truncate text-xs">{block.activityName}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
