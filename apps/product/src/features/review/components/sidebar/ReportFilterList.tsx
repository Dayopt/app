'use client';

import { useTranslations } from 'next-intl';

import { SidebarSection } from '@/components/shell/sidebar';
import { ActivityIcon, useActivityTree } from '@/features/activities';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { Checkbox, cn, Skeleton } from '@dayopt/components';

import { useActiveSegment } from '../../hooks/useActiveSegment';
import { useReportViewStore } from '../../stores/useReportViewStore';

/**
 * サイドバーの「カテゴリー — 分母から出し入れ」（仕様 §3.3-1）。
 *
 * 並ぶのはカテゴリー・未分類・余白の 3 種類だけで、**アクティビティは並べない**。
 * 葉は作成の起点であり、レポート面に作成は無い（仕様 §0-6 / §3.3-3）。
 *
 * トグルは即時に効く。確認ダイアログを挟まない — 分母の出し入れは可逆で、
 * 元に戻すのが同じ 1 クリックだから。
 *
 * 余白（未記録時間）はレンズ選択中に無効化する。レンズ中の分母はそのセグメントの
 * 記録合計そのもので、余白は入りようがない（仕様 §2.4）。
 */
export function ReportFilterList() {
  const t = useTranslations('report.sidebar');
  // `useIsMobile()` は使えない。幅 < 768px では `mobile-layout` が Sidebar ごと
  // 描かないので、この component が生きている間 true になることが無い（分岐が死ぬ）。
  // 実際にタッチで触られるのは iPad 縦のような「幅は広いが coarse pointer」の面
  const isTouch = useMediaQuery(MEDIA_QUERIES.touch);
  const { data: tree, isPending } = useActivityTree();

  const hiddenCategoryIds = useReportViewStore((state) => state.hiddenCategoryIds);
  const uncategorizedHidden = useReportViewStore((state) => state.uncategorizedHidden);
  const marginHidden = useReportViewStore((state) => state.marginHidden);
  const toggleCategory = useReportViewStore((state) => state.toggleCategory);
  const toggleUncategorized = useReportViewStore((state) => state.toggleUncategorized);
  const toggleMargin = useReportViewStore((state) => state.toggleMargin);

  const categories = tree?.categories ?? [];
  // 生の `segmentId` を見てはいけない。削除済みセグメントを指したままだと、
  // 画面のどこにもレンズが無いのに余白行だけ無効化されたまま戻せなくなる
  const { activeSegment, isResolving } = useActiveSegment();
  // 解決待ちの間も押させない。押せてしまうと `marginHidden` が永続化されるのに
  // レンズ確定後は無視され、後日「すべて」へ戻した時に理由の分からない状態が残る
  const marginLocked = activeSegment !== null || isResolving;

  return (
    <SidebarSection title={t('categoriesHeading')} className="space-y-1">
      {isPending ? (
        <div className="space-y-1 py-1">
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      ) : (
        <ul className="flex flex-col">
          {categories.map(({ category }) => (
            <FilterRow
              key={category.id}
              id={`report-filter-category-${category.id}`}
              compact={!isTouch}
              label={category.name}
              checked={!hiddenCategoryIds.includes(category.id)}
              onToggle={() => toggleCategory(category.id)}
              marker={<ActivityIcon icon={category.icon} color={category.color} size="sm" />}
            />
          ))}

          {/* 未分類はカテゴリーの一種ではなく残余バケット。色を継承する先が無いので中立表示 */}
          <FilterRow
            id="report-filter-uncategorized"
            compact={!isTouch}
            label={t('uncategorized')}
            checked={!uncategorizedHidden}
            onToggle={toggleUncategorized}
            marker={<ActivityIcon icon={null} color={null} size="sm" neutral />}
          />

          {/* 余白は記録ではなく紙。ドットも中抜きにして「塗られていない」ことを見た目で保つ */}
          <FilterRow
            id="report-filter-margin"
            compact={!isTouch}
            label={t('margin')}
            checked={!marginHidden}
            onToggle={toggleMargin}
            disabled={marginLocked}
            description={marginLocked ? t('marginLensDisabled') : undefined}
            marker={
              <span className="flex size-4 items-center justify-center">
                <span className="border-border size-3 rounded-full border" />
              </span>
            }
          />

          {categories.length === 0 ? (
            <li role="status" className="text-muted-foreground px-2 py-1 text-xs">
              {t('empty')}
            </li>
          ) : null}
        </ul>
      )}
    </SidebarSection>
  );
}

interface FilterRowProps {
  id: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  marker: React.ReactNode;
  /** desktop は行を詰める。モバイルは 44px のタッチターゲットを確保する。 */
  compact: boolean;
  disabled?: boolean;
  /** 無効化の理由。読み上げ用に `aria-describedby` で結ぶ。 */
  description?: string | undefined;
}

/**
 * 分母の出し入れ 1 行。
 *
 * カレンダーのサイドバー（`ActivityFilterList`）は Eye / EyeOff だが、こちらは
 * チェックボックスにする。あちらは「カレンダーに描くかどうか」、こちらは
 * 「分母に数えるかどうか」で、意味が違う。
 */
function FilterRow({
  id,
  label,
  checked,
  onToggle,
  marker,
  compact,
  disabled = false,
  description,
}: FilterRowProps) {
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <li>
      <label
        htmlFor={id}
        className={cn(
          'flex items-center gap-2 rounded-lg px-2 text-sm',
          compact ? 'min-h-8' : 'min-h-11',
          disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-state-hover cursor-pointer',
        )}
      >
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onToggle}
          {...(descriptionId ? { 'aria-describedby': descriptionId } : {})}
        />
        <span className="shrink-0">{marker}</span>
        <span className={cn('min-w-0 flex-1 truncate', !checked && 'text-muted-foreground')}>
          {label}
        </span>
      </label>
      {description ? (
        <p id={descriptionId} className="text-muted-foreground px-2 pb-1 text-xs">
          {description}
        </p>
      ) : null}
    </li>
  );
}
