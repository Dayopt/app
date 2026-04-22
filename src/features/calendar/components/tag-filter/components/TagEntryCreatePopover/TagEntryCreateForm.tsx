'use client';

import { useState } from 'react';

import { Button } from '@/lib/components/ui/button';
import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { Skeleton } from '@/lib/components/ui/skeleton';
import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import type { DurationDistribution } from './computeDurationDistribution';
import { DurationCandidates } from './DurationCandidates';
import { DurationHistogram } from './DurationHistogram';
import { DurationSlider } from './DurationSlider';
import { TimeChipRow, type TimeChip } from './TimeChipRow';

export interface TagEntryCreateSubmit {
  startKey: string;
  durationMinutes: number;
}

export interface TagEntryCreateFormProps {
  tag: {
    id: string;
    name: string;
    color: string | null;
  };
  distribution: DurationDistribution;
  /** 開始時刻チップ（f で動的算出値を受け取る想定、b ではモック） */
  timeChips: TimeChip[];
  defaultStartKey: string;
  defaultDurationMinutes: number;
  onSubmit: (payload: TagEntryCreateSubmit) => void;
  onCancel: () => void;
  onCustomTimeClick?: (() => void) | undefined;
  /** 分布データ fetch 中。candidates / histogram 領域に skeleton を出す（min-h はそのまま） */
  isLoading?: boolean;
  /** 分布データ fetch エラー。candidates / histogram を hide し slider のみ有効化 */
  isError?: boolean;
  /** エントリ作成 mutation 進行中。作成ボタンを disable */
  isSubmitting?: boolean;
  className?: string;
}

/**
 * タグエントリ作成フォームの body。
 *
 * レイアウト（上から）:
 * 1. タグ名ヘッダー（色ドット + colon ラベル）
 * 2. 開始時刻チップ行
 * 3. duration 候補チップ（min-h-10 で領域確保）
 * 4. ヒストグラム（sampleSize >= 10 で表示。それ未満でも min-h-20 は常に確保）
 * 5. スライダー（5-240m, 5m 刻み）
 * 6. キャンセル / 作成 ボタン
 *
 * Popover / Drawer どちらでも同じ body を使える。
 */
export function TagEntryCreateForm({
  tag,
  distribution,
  timeChips,
  defaultStartKey,
  defaultDurationMinutes,
  onSubmit,
  onCancel,
  onCustomTimeClick,
  isLoading = false,
  isError = false,
  isSubmitting = false,
  className,
}: TagEntryCreateFormProps) {
  const [startKey, setStartKey] = useState(defaultStartKey);
  const [durationMinutes, setDurationMinutes] = useState(defaultDurationMinutes);

  const colorClasses = getTagColorClasses(tag.color);

  // エラー時は candidates / histogram を hide して slider のみ表示する
  const showDistribution = !isError;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* 1. タグ名ヘッダー */}
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', colorClasses.dot)} />
        <ColonTagLabel name={tag.name} variant="separator" className="text-base font-medium" />
      </div>

      {/* 2. 開始時刻 */}
      <TimeChipRow
        chips={timeChips}
        selectedKey={startKey}
        onSelect={setStartKey}
        onCustomClick={onCustomTimeClick}
      />

      {/* 3. duration 候補（min-h-10 で layout shift 防止）
          loading 中は skeleton、error 時は空領域のみ（領域は常時確保） */}
      {showDistribution ? (
        isLoading ? (
          <div className="flex min-h-10 items-center">
            <Skeleton variant="shimmer" className="h-8 w-32" />
          </div>
        ) : (
          <DurationCandidates
            candidates={distribution.candidates}
            varianceFlag={distribution.varianceFlag}
            selectedMinutes={durationMinutes}
            onSelect={setDurationMinutes}
          />
        )
      ) : (
        <div className="min-h-10" aria-hidden />
      )}

      {/* 4. ヒストグラム（sampleSize < 10 でも min-h-20 は常時確保）
          loading 中は skeleton、error 時は空領域のみ */}
      {showDistribution ? (
        isLoading ? (
          <div className="min-h-20">
            <Skeleton variant="shimmer" className="h-20 w-full" />
          </div>
        ) : (
          <DurationHistogram
            bins={distribution.bins}
            sampleSize={distribution.sampleSize}
            tagColor={tag.color}
          />
        )
      ) : (
        <div className="min-h-20" aria-hidden />
      )}

      {/* 5. スライダー */}
      <DurationSlider value={durationMinutes} onChange={setDurationMinutes} />

      {/* 6. アクション */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          キャンセル
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onSubmit({ startKey, durationMinutes })}
          disabled={isSubmitting || !startKey}
        >
          作成
        </Button>
      </div>
    </div>
  );
}
