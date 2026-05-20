import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Skeleton } from '@/lib/components/ui/skeleton';
import { Switch } from '@/lib/components/ui/switch';

import { LabeledRow } from '@/lib/components/common/LabeledRow';
import { SectionCard } from '@/lib/components/common/SectionCard';
import { cn } from '@/lib/utils';

import { getChronotypeProfile, getDeepHours, getEaseHours } from '../lib/chronotype-profile';
import {
  CHRONOTYPE_EMOJI,
  CHRONOTYPE_PRESETS,
  CHRONOTYPE_SELECTABLE_TYPES,
} from '../lib/constants';

import type {
  ChronotypeType,
  PresetChronotypeType,
  ProductivityZone,
} from '@/lib/types/chronotype';

// ─────────────────────────────────────────────────────────
// Demo Components（tRPC/Zustandに依存しないpure版）
// ─────────────────────────────────────────────────────────

const SHORT_DESC: Record<PresetChronotypeType, string> = {
  lion: 'Morning focus',
  bear: 'Late-morning deep',
  wolf: 'Evening energy',
  dolphin: 'Late-morning stability',
};

function TimelineBarDemo({ zones }: { zones: ProductivityZone[] }) {
  const START = 6;
  const END = 22;

  const segments = Array.from({ length: END - START }, (_, i) => {
    const hour = START + i;
    const zone = zones.find((item) => {
      if (item.startHour <= item.endHour) {
        return hour >= item.startHour && hour < item.endHour;
      }
      return hour >= item.startHour || hour < item.endHour;
    });
    return { hour, level: zone?.level ?? ('warmup' as const) };
  });

  const deepZone = zones.find((z) => z.level === 'deep');
  const easeZone = zones.find((z) => z.level === 'ease');

  return (
    <div className="space-y-1">
      <div className="relative flex h-10 overflow-hidden rounded-lg">
        {segments.map((segment, index) => (
          <div
            key={index}
            className={cn(
              'relative flex-1',
              segment.level === 'deep' && 'bg-chronotype-deep-tint',
              segment.level === 'ease' && 'bg-chronotype-ease-tint',
              segment.level !== 'deep' && segment.level !== 'ease' && 'bg-muted',
            )}
          />
        ))}
        {deepZone && (
          <span
            className="text-chronotype-deep pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-medium uppercase"
            style={{
              left: `${((Math.max(deepZone.startHour, START) - START) / (END - START)) * 100 + 1}%`,
            }}
            aria-hidden="true"
          >
            DEEP
          </span>
        )}
        {easeZone && (
          <span
            className="text-chronotype-ease pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-medium uppercase"
            style={{
              left: `${((Math.max(easeZone.startHour, START) - START) / (END - START)) * 100 + 1}%`,
            }}
            aria-hidden="true"
          >
            EASE
          </span>
        )}
      </div>
      <div className="text-muted-foreground flex justify-between text-xs">
        {[6, 9, 12, 15, 18, 21].map((hour) => (
          <span key={hour}>{hour}:00</span>
        ))}
      </div>
    </div>
  );
}

function ChronotypeSettingsDemo({
  initialType = 'bear',
  initialEnabled = true,
}: {
  initialType?: PresetChronotypeType;
  initialEnabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [selectedType, setSelectedType] = useState<ChronotypeType>(initialType);
  const selectedProfile = getChronotypeProfile(selectedType);

  const handleSelectType = (type: PresetChronotypeType) => {
    setSelectedType(type);
    setEnabled(true);
  };

  return (
    <div className="max-w-2xl">
      <SectionCard title="Your rhythm">
        <div className="space-y-6">
          <LabeledRow
            label="Show focus zones on calendar"
            description="Highlight your best focus and rest windows on the calendar"
          >
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable rhythm" />
          </LabeledRow>

          {/* タイプ選択: 4 カード横並び */}
          <div className="flex gap-2">
            {CHRONOTYPE_SELECTABLE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleSelectType(type)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-2xl border p-4 transition-colors',
                  enabled && selectedType === type
                    ? 'border-foreground bg-card'
                    : 'border-border hover:border-foreground/30',
                )}
              >
                <span className="text-2xl">{CHRONOTYPE_EMOJI[type]}</span>
                <span className="text-sm font-medium">{CHRONOTYPE_PRESETS[type].name}</span>
                <span className="text-muted-foreground text-xs">{SHORT_DESC[type]}</span>
              </button>
            ))}
          </div>

          {/* enabled 時のみ表示 */}
          {enabled && selectedProfile ? (
            <>
              <p className="text-muted-foreground text-sm">{selectedProfile.description}</p>

              <TimelineBarDemo zones={selectedProfile.productivityZones} />

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-chronotype-deep-tint flex items-center gap-4 rounded-2xl p-4">
                  <span className="bg-chronotype-deep/20 text-chronotype-deep flex size-8 shrink-0 items-center justify-center rounded-lg text-base">
                    ↗
                  </span>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs leading-none">Deep time</p>
                    <p className="text-sm leading-tight font-medium">
                      {getDeepHours(selectedProfile.productivityZones)}
                    </p>
                    <p className="text-muted-foreground text-xs leading-none">Best for Deep Work</p>
                  </div>
                </div>
                <div className="bg-chronotype-ease-tint flex items-center gap-4 rounded-2xl p-4">
                  <span className="bg-chronotype-ease/20 text-chronotype-ease flex size-8 shrink-0 items-center justify-center rounded-lg text-base">
                    ↘
                  </span>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs leading-none">Ease time</p>
                    <p className="text-sm leading-tight font-medium">
                      {getEaseHours(selectedProfile.productivityZones)}
                    </p>
                    <p className="text-muted-foreground text-xs leading-none">Light tasks & rest</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

function ChronotypeSettingsLoadingDemo() {
  return (
    <div className="max-w-2xl">
      <SectionCard title="Your rhythm">
        <Skeleton className="h-12 w-full rounded-lg" />
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Meta & Stories
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Chronotype/Settings',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** 有効 + Bear */
export const EnabledBear: Story = {
  render: () => <ChronotypeSettingsDemo initialType="bear" />,
};

/** 有効 + Lion */
export const EnabledLion: Story = {
  render: () => <ChronotypeSettingsDemo initialType="lion" />,
};

/** 有効 + Dolphin */
export const EnabledDolphin: Story = {
  render: () => <ChronotypeSettingsDemo initialType="dolphin" />,
};

/** 無効（トグル OFF） */
export const Disabled: Story = {
  render: () => <ChronotypeSettingsDemo initialEnabled={false} />,
};

/** ローディング */
export const Loading: Story = {
  render: () => <ChronotypeSettingsLoadingDemo />,
};
