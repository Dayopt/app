'use client';

import type { PresetChronotypeType } from '@/types/chronotype';

interface AnimalCardProps {
  type: PresetChronotypeType;
  emoji: string;
  name: string;
  trait: string;
  time: string;
  hint: string;
  isSelected: boolean;
  onSelect: (type: PresetChronotypeType) => void;
}

/** クロノタイプ選択用の動物カードコンポーネント */
export function AnimalCard({
  type,
  emoji,
  name,
  trait,
  time,
  hint,
  isSelected,
  onSelect,
}: AnimalCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(type)}
      className={`border-border hover:bg-state-hover flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors ${
        isSelected ? 'bg-state-hover border-primary ring-primary/20 ring-2' : ''
      }`}
    >
      <span className="text-3xl">{emoji}</span>
      <span className="text-sm font-medium">{name}</span>
      <span className="text-muted-foreground text-xs">{trait}</span>
      <span className="text-muted-foreground text-xs">{time}</span>
      <span className="text-muted-foreground text-xs leading-tight">{hint}</span>
    </button>
  );
}
