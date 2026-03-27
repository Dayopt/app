import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Skeleton } from '@/components/ui/skeleton';

import { SectionCard } from '@/components/common/SectionCard';
import { cn } from '@/lib/utils';

import {
  CHRONOTYPE_EMOJI,
  CHRONOTYPE_PRESETS,
  CHRONOTYPE_SELECTABLE_TYPES,
} from '../lib/constants';
import { getDipHours, getPeakHours, getPresetChronotypeProfile } from '../lib/utils';

import type { ChronotypeType, PresetChronotypeType, ProductivityZone } from '@/types/chronotype';

// ─────────────────────────────────────────────────────────
// Demo Components（tRPC/Zustandに依存しないpure版）
// ─────────────────────────────────────────────────────────

const POPULATION: Record<PresetChronotypeType, string> = {
  lion: '15-20%',
  bear: '~55%',
  wolf: '15-20%',
  dolphin: '~10%',
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

  const peakZone = zones.find((z) => z.level === 'peak');
  const dipZone = zones.find((z) => z.level === 'dip');

  return (
    <div className="space-y-1">
      <div className="relative flex h-10 overflow-hidden rounded-lg">
        {segments.map((segment, index) => (
          <div
            key={index}
            className={cn(
              'relative flex-1',
              segment.level === 'peak' && 'bg-chronotype-peak-tint',
              segment.level === 'dip' && 'bg-chronotype-dip-tint',
              segment.level !== 'peak' && segment.level !== 'dip' && 'bg-muted',
            )}
          />
        ))}
        {peakZone && (
          <span
            className="text-chronotype-peak pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-bold uppercase"
            style={{
              left: `${((Math.max(peakZone.startHour, START) - START) / (END - START)) * 100 + 1}%`,
            }}
          >
            PEAK
          </span>
        )}
        {dipZone && (
          <span
            className="text-chronotype-dip pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-bold uppercase"
            style={{
              left: `${((Math.max(dipZone.startHour, START) - START) / (END - START)) * 100 + 1}%`,
            }}
          >
            DIP
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

function ChronotypeSettingsDemo({ initialType = 'bear' }: { initialType?: PresetChronotypeType }) {
  const [selectedType, setSelectedType] = useState<ChronotypeType>(initialType);
  const selectedProfile = getPresetChronotypeProfile(selectedType);

  return (
    <div className="max-w-2xl">
      <SectionCard title="Chronotype">
        <div className="space-y-6">
          {/* タイプ選択: 4 カード横並び */}
          <div className="flex gap-2">
            {CHRONOTYPE_SELECTABLE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-xl border p-3 transition-colors',
                  selectedType === type
                    ? 'border-foreground bg-card'
                    : 'border-border hover:border-foreground/30',
                )}
              >
                <span className="text-2xl">{CHRONOTYPE_EMOJI[type]}</span>
                <span className="text-sm font-bold">{CHRONOTYPE_PRESETS[type].name}</span>
                <span className="text-muted-foreground text-xs">{POPULATION[type]}</span>
              </button>
            ))}
          </div>

          {selectedProfile ? (
            <>
              <p className="text-muted-foreground text-sm">{selectedProfile.description}</p>

              <TimelineBarDemo zones={selectedProfile.productivityZones} />

              {/* Peak / Dip 結果カード */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-chronotype-peak-tint flex items-center gap-3 rounded-xl p-4">
                  <span className="bg-chronotype-peak/20 text-chronotype-peak flex size-8 shrink-0 items-center justify-center rounded-lg text-base">
                    ↗
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground text-xs leading-none">Peak time</p>
                    <p className="text-sm leading-tight font-bold">
                      {getPeakHours(selectedProfile.productivityZones)}
                    </p>
                    <p className="text-muted-foreground text-xs leading-none">Best for Deep Work</p>
                  </div>
                </div>
                <div className="bg-chronotype-dip-tint flex items-center gap-3 rounded-xl p-4">
                  <span className="bg-chronotype-dip/20 text-chronotype-dip flex size-8 shrink-0 items-center justify-center rounded-lg text-base">
                    ↘
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground text-xs leading-none">Dip time</p>
                    <p className="text-sm leading-tight font-bold">
                      {getDipHours(selectedProfile.productivityZones)}
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
      <SectionCard title="Chronotype">
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

/** Bear（標準型）を選択した状態 */
export const BearSelected: Story = {
  render: () => <ChronotypeSettingsDemo initialType="bear" />,
};

/** Lion（朝型）を選択した状態 */
export const LionSelected: Story = {
  render: () => <ChronotypeSettingsDemo initialType="lion" />,
};

/** Wolf（夜型）を選択した状態 */
export const WolfSelected: Story = {
  render: () => <ChronotypeSettingsDemo initialType="wolf" />,
};

/** Dolphin（不規則型）を選択した状態 */
export const DolphinSelected: Story = {
  render: () => <ChronotypeSettingsDemo initialType="dolphin" />,
};

/** ローディング状態 */
export const Loading: Story = {
  render: () => <ChronotypeSettingsLoadingDemo />,
};
