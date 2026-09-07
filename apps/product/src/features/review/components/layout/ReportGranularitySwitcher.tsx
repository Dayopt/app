'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  buttonVariants,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dayopt/components';

import type { ReportGranularity } from '../../lib/report-period';

interface ReportGranularitySwitcherProps {
  value: ReportGranularity;
  onValueChange: (value: ReportGranularity) => void;
  className?: string | undefined;
}

const GRANULARITY_OPTIONS: readonly ReportGranularity[] = ['week', 'month', 'year'];

/**
 * 週 / 月 / 年 の粒度切替。
 *
 * カレンダーのビュー切替（`ViewSwitcher`）と**同じ作り**にする（2026-09-07 User 指示）:
 * `h-8` の outline トリガー + シェブロン + `DropdownMenu`。以前はセグメントだったが、
 * セグメントは 1 項目が `min-h-11`（44px タッチターゲット）なので枠込み 54px になり、
 * ヘッダーの 32px 行から上下にはみ出して、レポートのヘッダーだけ厚く見えていた。
 *
 * 器を揃えたことでトリガーが 32px になり、`DateNavigator` と高さが揃う。
 */
export function ReportGranularitySwitcher({
  value,
  onValueChange,
  className,
}: ReportGranularitySwitcherProps) {
  const t = useTranslations('report.granularity');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'justify-start gap-0 text-sm',
          className,
        )}
      >
        <span>{t(value)}</span>
        <ChevronDown className="ml-2 size-4" />
      </DropdownMenuTrigger>
      {/* トリガーの読み上げ名は現在値（「週」）にする（カレンダーと同じ）。何を切り替える
          メニューなのかは、こちら側の `aria-label` が受け持つ */}
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="min-w-48"
        aria-label={t('ariaLabel')}
      >
        {GRANULARITY_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => onValueChange(option)}
            className="flex items-center justify-between gap-2"
          >
            <span>{t(option)}</span>
            {/* 未選択でも幅を空けて、チェックの有無でラベルが動かないようにする */}
            {value === option ? (
              <Check className="text-primary size-4" />
            ) : (
              <span className="w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
