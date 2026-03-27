'use client';

import { getMonth, getYear } from 'date-fns';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';

const START_YEAR = 2020;
const END_YEAR = 2050;

type StripItem =
  | { type: 'year'; year: number }
  | { type: 'month'; year: number; month: number; label: string };

interface MobileYearStripProps {
  viewMonth: Date;
  onViewMonthChange: (newMonth: Date) => void;
  className?: string | undefined;
}

/**
 * Google Calendar準拠の横スクロール月セレクタ
 *
 * 月グリッドの下に配置。年ラベル + 12ヶ月が年をまたいで連続し、
 * 横スクロールで過去・未来の月を自由に選択できる。
 */
export const MobileYearStrip = memo<MobileYearStripProps>(
  ({ viewMonth, onViewMonthChange, className }) => {
    const tCommon = useTranslations('common');
    const scrollRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLButtonElement>(null);
    const currentYear = getYear(viewMonth);
    const currentMonth = getMonth(viewMonth);

    const monthsShort = tCommon.raw('dates.monthsShort') as string[];

    // 全年×12ヶ月のフラットリストを生成（年ラベル挟み込み）
    const items = useMemo(() => {
      const result: StripItem[] = [];
      for (let year = START_YEAR; year <= END_YEAR; year++) {
        result.push({ type: 'year', year });
        for (let month = 0; month < 12; month++) {
          result.push({ type: 'month', year, month, label: monthsShort[month]! });
        }
      }
      return result;
    }, [monthsShort]);

    const handleMonthClick = useCallback(
      (year: number, month: number) => {
        onViewMonthChange(new Date(year, month, 1));
      },
      [onViewMonthChange],
    );

    // 選択中の月を中央にスクロール
    useEffect(() => {
      const el = activeRef.current;
      const container = scrollRef.current;
      if (!el || !container) return;

      const scrollTarget = el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
      container.scrollTo({ left: scrollTarget, behavior: 'smooth' });
    }, [currentYear, currentMonth]);

    return (
      <div
        ref={scrollRef}
        className={cn(
          'scrollbar-hide flex items-center overflow-x-auto overscroll-x-contain py-2',
          className,
        )}
      >
        {items.map((item) => {
          if (item.type === 'year') {
            return (
              <span
                key={`y-${item.year}`}
                className="text-muted-foreground mx-1 flex h-7 shrink-0 items-center justify-center px-2 text-xs font-medium"
              >
                {item.year}
              </span>
            );
          }

          const isActive = item.year === currentYear && item.month === currentMonth;

          return (
            <button
              key={`m-${item.year}-${item.month}`}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => handleMonthClick(item.year, item.month)}
              className={cn(
                'mx-0.5 flex h-7 shrink-0 items-center justify-center rounded-full px-3 text-xs transition-colors',
                isActive
                  ? 'border-primary text-primary border font-bold'
                  : 'border-border text-muted-foreground hover:text-foreground border',
              )}
              aria-current={isActive ? 'true' : undefined}
              aria-label={`${item.year}-${String(item.month + 1).padStart(2, '0')}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    );
  },
);

MobileYearStrip.displayName = 'MobileYearStrip';
