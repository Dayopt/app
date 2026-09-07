'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { getCategoryColorClasses, useActivityTree } from '@/features/activities';
import {
  cn,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  Skeleton,
} from '@dayopt/components';

import { useActiveSegment } from '../../hooks/useActiveSegment';
import { useSegments } from '../../hooks/useSegments';
import { useReportViewStore } from '../../stores/useReportViewStore';

/**
 * モバイルのフィルタチップ列（仕様 §8）。
 *
 * サイドバーの `ReportFilterList` / `SegmentList` と**同じ store（`useReportViewStore`）を
 * 読み書きする**。器が違うだけで、分母の出し入れもレンズも 1 つの真実に集約する
 * （モバイル専用の集計を作らない = 仕様 §13-13）。
 *
 * **セグメントは選ぶだけ**。作成・改名・削除はデスクトップのサイドバーにしか無い
 * （仕様 §8「作れないもの: セグメント作成」）。
 */
export function ReportFilterChipRow() {
  const t = useTranslations('report.sidebar');
  const tMobile = useTranslations('report.mobile');
  const { data: tree, isPending } = useActivityTree();
  const { data: segments } = useSegments();
  const [lensOpen, setLensOpen] = useState(false);

  const hiddenCategoryIds = useReportViewStore((state) => state.hiddenCategoryIds);
  const uncategorizedHidden = useReportViewStore((state) => state.uncategorizedHidden);
  const marginHidden = useReportViewStore((state) => state.marginHidden);
  const toggleCategory = useReportViewStore((state) => state.toggleCategory);
  const toggleUncategorized = useReportViewStore((state) => state.toggleUncategorized);
  const toggleMargin = useReportViewStore((state) => state.toggleMargin);
  const setSegmentId = useReportViewStore((state) => state.setSegmentId);

  // 削除済みセグメントの縮退はここでも hook に任せる（サイドバーと同じ答えを使う）
  const { activeSegment, isResolving } = useActiveSegment();
  // レンズ中は余白が分母に入らないので、チップも押させない（サイドバーと同じ判断）
  const marginLocked = activeSegment !== null || isResolving;

  if (isPending) {
    return (
      <div className="flex gap-2 overflow-hidden px-4 py-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
    );
  }

  return (
    <div
      data-report-chips="filter"
      className="flex items-center gap-2 overflow-x-auto px-4 py-2"
      role="group"
      aria-label={t('categoriesHeading')}
    >
      {(tree?.categories ?? []).map(({ category }) => (
        <FilterChip
          key={category.id}
          active={!hiddenCategoryIds.includes(category.id)}
          color={category.color}
          label={category.name}
          onToggle={() => toggleCategory(category.id)}
        />
      ))}

      <FilterChip
        active={!uncategorizedHidden}
        color={null}
        label={t('uncategorized')}
        onToggle={toggleUncategorized}
      />

      <FilterChip
        active={!marginHidden && !marginLocked}
        color={null}
        disabled={marginLocked}
        label={t('margin')}
        onToggle={toggleMargin}
      />

      {/* レンズ（束）。選ぶだけで、作成はデスクトップのサイドバーにしか無い */}
      <button
        type="button"
        onClick={() => setLensOpen(true)}
        aria-label={tMobile('lens.open')}
        className="border-border-subtle text-foreground flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-4 text-xs"
      >
        {activeSegment?.name ?? tMobile('lens.chip')}
        <ChevronDown className="size-4" />
      </button>

      <Drawer open={lensOpen} onOpenChange={setLensOpen}>
        <DrawerContent data-report-sheet="lens">
          <DrawerTitle className="px-4 pt-4 text-sm font-medium">{t('lensHeading')}</DrawerTitle>
          <DrawerDescription className="sr-only">{t('lensHeading')}</DrawerDescription>

          <ul className="flex flex-col gap-1 p-4">
            <li>
              <LensRow
                active={activeSegment === null}
                label={t('lensAll')}
                onSelect={() => {
                  setSegmentId(null);
                  setLensOpen(false);
                }}
              />
            </li>
            {(segments ?? []).map((segment) => (
              <li key={segment.id}>
                <LensRow
                  active={activeSegment?.id === segment.id}
                  label={segment.name}
                  onSelect={() => {
                    setSegmentId(segment.id);
                    setLensOpen(false);
                  }}
                />
              </li>
            ))}
          </ul>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** 1 つのチップ。オフは薄くするだけで、良し悪しの色は付けない（仕様 §12）。 */
function FilterChip({
  active,
  color,
  disabled = false,
  label,
  onToggle,
}: {
  active: boolean;
  color: string | null;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'border-border-subtle text-foreground flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-xs',
        !active && 'opacity-40',
        disabled && 'cursor-not-allowed',
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{
          backgroundColor:
            color === null ? 'var(--muted-foreground)' : getCategoryColorClasses(color).cssVar,
        }}
      />
      {label}
    </button>
  );
}

function LensRow({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'hover:bg-state-hover flex min-h-11 w-full items-center rounded-lg px-4 text-left text-sm',
        active && 'bg-state-selected',
      )}
    >
      {label}
    </button>
  );
}
