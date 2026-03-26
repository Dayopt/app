import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Star } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';

import {
  CHRONOTYPE_EMOJI,
  CHRONOTYPE_LEVEL_ORDER,
  CHRONOTYPE_PRESETS,
  CHRONOTYPE_SELECTABLE_TYPES,
} from '../lib/constants';
import { getPeakHours, getPresetChronotypeProfile } from '../lib/utils';

import type { ChronotypeType, PresetChronotypeType, ProductivityZone } from '@/types/chronotype';

// ─────────────────────────────────────────────────────────
// Demo Components（tRPC/Zustandに依存しないpure版）
// ─────────────────────────────────────────────────────────

function TimelineBarDemo({ zones }: { zones: ProductivityZone[] }) {
  const segments = Array.from({ length: 24 }, (_, hour) => {
    const zone = zones.find((item) => {
      if (item.startHour <= item.endHour) {
        return hour >= item.startHour && hour < item.endHour;
      }
      return hour >= item.startHour || hour < item.endHour;
    });
    return {
      hour,
      level: zone?.level ?? ('warmup' as const),
      label: zone?.label ?? '',
    };
  });

  const LEVEL_LABELS: Record<string, string> = {
    warmup: 'Warmup',
    peak: 'Peak',
    dip: 'Dip',
    recovery: 'Recovery',
    winddown: 'Wind Down',
  };

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>0:00</span>
        <span>6:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
      <div className="flex h-6 overflow-hidden rounded-lg">
        {segments.map((segment, index) => (
          <div
            key={index}
            className="bg-primary flex-1 transition-colors"
            title={`${segment.hour}:00 - ${segment.label}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        {CHRONOTYPE_LEVEL_ORDER.map((level) => (
          <div key={level} className="flex items-center gap-1">
            <div className="bg-primary h-3 w-3 rounded" />
            <span className="text-muted-foreground">{LEVEL_LABELS[level]}</span>
          </div>
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
  const NONE_VALUE = 'none';
  const [enabled, setEnabled] = useState(initialEnabled);
  const [selectedType, setSelectedType] = useState<ChronotypeType>(initialType);

  const selectValue = enabled ? selectedType : NONE_VALUE;
  const selectedProfile = enabled ? getPresetChronotypeProfile(selectedType) : null;

  const handleTypeSelect = (value: string) => {
    if (value === NONE_VALUE) {
      setEnabled(false);
    } else {
      setEnabled(true);
      setSelectedType(value as ChronotypeType);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <SectionCard title="Chronotype">
        <LabeledRow label="Chronotype">
          <Select value={selectValue} onValueChange={handleTypeSelect}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Not selected</SelectItem>
              {CHRONOTYPE_SELECTABLE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {CHRONOTYPE_EMOJI[type]} {CHRONOTYPE_PRESETS[type].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledRow>
      </SectionCard>

      {selectedProfile ? (
        <SectionCard title="Details">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <span className="text-3xl">
                {CHRONOTYPE_EMOJI[selectedType as PresetChronotypeType]}
              </span>
              <div>
                <h4 className="font-normal">{selectedProfile.name}</h4>
                <p className="text-muted-foreground mt-1 text-sm">{selectedProfile.description}</p>
              </div>
            </div>

            <div className="pt-2">
              <h5 className="mb-4 text-sm font-normal">Timeline</h5>
              <TimelineBarDemo zones={selectedProfile.productivityZones} />
            </div>

            <div className="bg-success/10 flex items-center gap-2 rounded-2xl p-4">
              <Star className="text-success h-4 w-4" />
              <div>
                <span className="text-sm font-normal">Peak Time</span>
                <span className="text-muted-foreground ml-2 text-sm">
                  {getPeakHours(selectedProfile.productivityZones)}
                </span>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────

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
    // button-name: SelectTrigger without explicit label in LabeledRow component
    a11y: { test: 'todo' },
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

/** 未選択状態 */
export const NotSelected: Story = {
  render: () => <ChronotypeSettingsDemo initialEnabled={false} />,
};

/** ローディング状態 */
export const Loading: Story = {
  render: () => <ChronotypeSettingsLoadingDemo />,
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">
          Bear（標準型）を選択した状態
        </p>
        <ChronotypeSettingsDemo initialType="bear" />
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">Lion（朝型）を選択した状態</p>
        <ChronotypeSettingsDemo initialType="lion" />
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">Wolf（夜型）を選択した状態</p>
        <ChronotypeSettingsDemo initialType="wolf" />
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">
          Dolphin（不規則型）を選択した状態
        </p>
        <ChronotypeSettingsDemo initialType="dolphin" />
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">未選択状態</p>
        <ChronotypeSettingsDemo initialEnabled={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">ローディング状態</p>
        <ChronotypeSettingsLoadingDemo />
      </div>
    </div>
  ),
};
