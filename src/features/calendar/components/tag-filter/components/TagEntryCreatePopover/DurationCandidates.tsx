'use client';

import { cn } from '@/lib/utils';
import type { DurationCandidate } from './computeDurationDistribution';

interface DurationCandidatesProps {
  candidates: DurationCandidate[];
  varianceFlag: boolean;
  selectedMinutes: number | null;
  onSelect: (minutes: number) => void;
}

/**
 * duration 候補チップ行。
 *
 * - 最大 3 個。空でも min-h-10 (40px) を確保して layout shift を抑える
 * - varianceFlag が true のとき `opacity-60` + `~` プレフィックスで「目安」感を出す
 * - 選択中チップは primary 塗り。未選択は outline
 */
export function DurationCandidates({
  candidates,
  varianceFlag,
  selectedMinutes,
  onSelect,
}: DurationCandidatesProps) {
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-2">
      {candidates.map((candidate) => {
        const isSelected = selectedMinutes === candidate.durationMinutes;
        return (
          <button
            key={candidate.durationMinutes}
            type="button"
            onClick={() => onSelect(candidate.durationMinutes)}
            className={cn(
              'inline-flex h-8 items-center rounded-lg border px-4 text-sm tabular-nums transition-colors duration-150',
              isSelected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-foreground hover:bg-state-hover',
              varianceFlag && !isSelected && 'opacity-60',
            )}
            aria-pressed={isSelected}
          >
            {varianceFlag && '~'}
            {candidate.durationMinutes}m
          </button>
        );
      })}
    </div>
  );
}
