'use client';

import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  defaultDropAnimation,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SectionCard } from '@/lib/components/common/SectionCard';
import { Badge } from '@/lib/components/ui/badge';
import { Skeleton } from '@/lib/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/lib/components/ui/tabs';
import { CACHE_5_MINUTES } from '@/lib/date';
import { useAutoSaveSettings } from '@/lib/hooks/useAutoSaveSettings';
import { api } from '@/lib/trpc';
import { cn } from '@/lib/utils';

import type { DragEndEvent, DropAnimation, Modifier } from '@dnd-kit/core';
import type { AnimateLayoutChanges } from '@dnd-kit/sortable';
import type { ValueKeyword, ValueKeywordCategory } from '../types/personalization';
import { MAX_RANKED_VALUES, VALUE_KEYWORD_CATEGORIES } from '../types/personalization';
import { getKeywordsForCategory } from './value-keyword-categories';

/** ドラッグ中はレイアウトアニメーションを無効化（タグツリーと同じパターン） */
const animateLayoutChanges: AnimateLayoutChanges = ({ isSorting, wasDragging }) =>
  isSorting || wasDragging ? false : true;

const measuring = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

const dropAnimationConfig: DropAnimation = {
  keyframes({ transform }) {
    return [
      { opacity: 1, transform: CSS.Transform.toString(transform.initial) },
      {
        opacity: 0,
        transform: CSS.Transform.toString({
          ...transform.final,
          x: transform.final.x + 5,
          y: transform.final.y + 5,
        }),
      },
    ];
  },
  easing: 'ease-out',
  sideEffects({ active }) {
    active.node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: defaultDropAnimation.duration,
      easing: defaultDropAnimation.easing,
    });
  },
};

const adjustTranslate: Modifier = ({ transform }) => ({
  ...transform,
  y: transform.y - 25,
});

interface RankingAutoSaveSettings {
  rankedValues: string[];
}

/**
 * 価値観キーワードランキング設定
 *
 * カテゴリタブ付きチップグリッド + 常時表示のランキングリストの統合ビュー
 */
export function ValueRankingSettings() {
  const t = useTranslations();
  const utils = api.useUtils();

  const { data: dbSettings, isPending } = api.userSettings.get.useQuery(undefined, {
    staleTime: CACHE_5_MINUTES,
  });

  const updateMutation = api.userSettings.update.useMutation({
    onSuccess: () => {
      utils.userSettings.get.invalidate();
    },
  });

  const dbRankedValues = useMemo(
    () =>
      ((dbSettings?.personalization?.rankedValues ?? []) as string[]).slice(0, MAX_RANKED_VALUES),
    [dbSettings?.personalization?.rankedValues],
  );

  const initialValues = useMemo(
    () => ({
      rankedValues: dbRankedValues,
    }),
    [dbRankedValues],
  );

  const autoSave = useAutoSaveSettings<RankingAutoSaveSettings>({
    initialValues,
    onSave: async (values) => {
      await updateMutation.mutateAsync({
        rankedValues: values.rankedValues,
      });
    },
    successMessage: t('settings.values.ranking.settingsSaved'),
    debounceMs: 800,
  });

  const selectedSet = useMemo(
    () => new Set(autoSave.values.rankedValues),
    [autoSave.values.rankedValues],
  );

  const handleKeywordToggle = useCallback(
    (keyword: ValueKeyword) => {
      const current = autoSave.values.rankedValues;
      if (selectedSet.has(keyword)) {
        autoSave.updateValue(
          'rankedValues',
          current.filter((k) => k !== keyword),
        );
      } else if (current.length < MAX_RANKED_VALUES) {
        autoSave.updateValue('rankedValues', [...current, keyword]);
      }
    },
    [autoSave, selectedSet],
  );

  const handleReorder = useCallback(
    (newOrder: string[]) => {
      autoSave.updateValue('rankedValues', newOrder);
    },
    [autoSave],
  );

  const handleRemove = useCallback(
    (keyword: string) => {
      autoSave.updateValue(
        'rankedValues',
        autoSave.values.rankedValues.filter((k) => k !== keyword),
      );
    },
    [autoSave],
  );

  if (isPending) {
    return (
      <SectionCard title={t('settings.values.ranking.title')}>
        <Skeleton className="mb-4 h-4 w-48" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t('settings.values.ranking.title')}>
      <p className="text-muted-foreground mb-4 text-base md:text-sm">
        {t('settings.values.ranking.description')}
      </p>

      <CategoryTabsGrid
        selected={selectedSet}
        rankedValues={autoSave.values.rankedValues}
        onToggle={handleKeywordToggle}
      />

      <RankedList
        items={autoSave.values.rankedValues}
        onReorder={handleReorder}
        onRemove={handleRemove}
      />
    </SectionCard>
  );
}

/* ─────────────────────────────────────────────────────────
 * CategoryTabsGrid — カテゴリタブ付きキーワードチップグリッド
 * ───────────────────────────────────────────────────────── */

interface CategoryTabsGridProps {
  selected: Set<string>;
  rankedValues: string[];
  onToggle: (keyword: ValueKeyword) => void;
}

function CategoryTabsGrid({ selected, rankedValues, onToggle }: CategoryTabsGridProps) {
  const t = useTranslations();
  const [activeCategory, setActiveCategory] = useState<ValueKeywordCategory>('all');
  const isAtLimit = selected.size >= MAX_RANKED_VALUES;

  return (
    <Tabs
      value={activeCategory}
      onValueChange={(v) => setActiveCategory(v as ValueKeywordCategory)}
    >
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList className="w-max" aria-label={t('settings.values.ranking.title')}>
          {VALUE_KEYWORD_CATEGORIES.map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {t(`settings.values.ranking.categories.${cat}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {VALUE_KEYWORD_CATEGORIES.map((cat) => (
        <TabsContent key={cat} value={cat} className="pt-4">
          <div className="flex flex-wrap gap-2">
            {getKeywordsForCategory(cat).map((keyword) => {
              const isSelected = selected.has(keyword);
              const rank = rankedValues.indexOf(keyword) + 1;

              return (
                <KeywordChip
                  key={keyword}
                  keyword={keyword}
                  label={t(`settings.values.keywords.${keyword}`)}
                  rank={rank}
                  isSelected={isSelected}
                  isDisabled={!isSelected && isAtLimit}
                  onToggle={onToggle}
                />
              );
            })}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

/* ─────────────────────────────────────────────────────────
 * KeywordChip — ランク番号バッジ付きキーワードチップ
 * ───────────────────────────────────────────────────────── */

interface KeywordChipProps {
  keyword: ValueKeyword;
  label: string;
  rank: number;
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: (keyword: ValueKeyword) => void;
}

function KeywordChip({ keyword, label, rank, isSelected, isDisabled, onToggle }: KeywordChipProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(keyword)}
      disabled={isDisabled}
      className="relative cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Badge variant={isSelected ? 'secondary' : 'outline'} className="text-base">
        {label}
      </Badge>
      {rank > 0 && (
        <span
          aria-hidden="true"
          className="bg-foreground text-background absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full text-xs leading-none"
        >
          {rank}
        </span>
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────
 * RankedList — ドラッグ並び替え + 削除付きランキングリスト
 * ───────────────────────────────────────────────────────── */

interface RankedListProps {
  items: string[];
  onReorder: (items: string[]) => void;
  onRemove: (keyword: string) => void;
}

function RankedList({ items, onReorder, onRemove }: RankedListProps) {
  const t = useTranslations();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (over && active.id !== over.id) {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        onReorder(arrayMove(items, oldIndex, newIndex));
      }
    },
    [items, onReorder],
  );

  const activeItem = activeId ? activeId : null;

  return (
    <div
      className="mt-6"
      role="region"
      aria-label={t('settings.values.ranking.top5Title', { max: MAX_RANKED_VALUES })}
    >
      <div className="text-foreground mb-2 text-base font-medium md:text-sm">
        {t('settings.values.ranking.top5Title', { max: MAX_RANKED_VALUES })}
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground py-4 text-base md:text-sm">
          {t('settings.values.ranking.emptyHint')}
        </p>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            measuring={measuring}
            onDragStart={({ active }) => {
              setActiveId(active.id as string);
              document.body.style.setProperty('cursor', 'grabbing');
            }}
            onDragEnd={(event) => {
              document.body.style.setProperty('cursor', '');
              handleDragEnd(event);
            }}
            onDragCancel={() => {
              setActiveId(null);
              document.body.style.setProperty('cursor', '');
            }}
          >
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {items.map((keyword, index) => (
                  <SortableRankItem
                    key={keyword}
                    id={keyword}
                    rank={index + 1}
                    label={t(`settings.values.keywords.${keyword}`)}
                    onRemove={onRemove}
                  />
                ))}
              </div>
            </SortableContext>
            {typeof document !== 'undefined' &&
              createPortal(
                <DragOverlay dropAnimation={dropAnimationConfig} modifiers={[adjustTranslate]}>
                  {activeItem ? (
                    <RankItemOverlay label={t(`settings.values.keywords.${activeItem}`)} />
                  ) : null}
                </DragOverlay>,
                document.body,
              )}
          </DndContext>

          <div className="text-muted-foreground mt-2 text-right text-xs">
            {t('settings.values.ranking.selected', {
              count: items.length,
              max: MAX_RANKED_VALUES,
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * SortableRankItem — ドラッグ可能なランクアイテム
 * ───────────────────────────────────────────────────────── */

interface SortableRankItemProps {
  id: string;
  rank: number;
  label: string;
  onRemove: (keyword: string) => void;
}

function SortableRankItem({ id, rank, label, onRemove }: SortableRankItemProps) {
  const t = useTranslations();
  const {
    attributes,
    listeners,
    setDraggableNodeRef,
    setDroppableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, animateLayoutChanges });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setDroppableNodeRef}
      style={style}
      className={cn(
        'border-border bg-background flex items-center gap-2 rounded-lg border px-4 py-2',
        isDragging && 'opacity-40',
      )}
    >
      <span className="bg-foreground text-background flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
        {rank}
      </span>
      <span className="text-foreground flex-1 text-base md:text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="text-muted-foreground hover:text-foreground p-1 transition-colors duration-150"
        aria-label={t('settings.values.ranking.remove', { keyword: label })}
      >
        <X className="size-4" />
      </button>
      <button
        ref={setDraggableNodeRef}
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
        aria-label={t('settings.values.ranking.dragHint')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * RankItemOverlay — ドラッグ中のゴースト表示
 * ───────────────────────────────────────────────────────── */

interface RankItemOverlayProps {
  label: string;
}

function RankItemOverlay({ label }: RankItemOverlayProps) {
  return (
    <div className="border-foreground bg-background flex items-center gap-2 rounded-lg border-2 px-4 py-2 shadow-sm">
      <span className="text-foreground flex-1 text-base md:text-sm">{label}</span>
      <GripVertical className="text-muted-foreground size-4" />
    </div>
  );
}
