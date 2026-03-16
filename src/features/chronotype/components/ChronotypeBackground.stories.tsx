import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { cn } from '@/lib/utils';

import { CHRONOTYPE_LEVEL_TINT_CLASSES, CHRONOTYPE_PRESETS } from '../lib/constants';
import { getVisibleProductivityZones } from '../lib/utils';

import type { ChronotypeProfile, PresetChronotypeType } from '@/types/chronotype';

// ─────────────────────────────────────────────────────────
// Demo Component（Zustandストアに依存しないpure版）
// ─────────────────────────────────────────────────────────

interface ChronotypeBackgroundDemoProps {
  chronotypeType: PresetChronotypeType;
  startHour: number;
  endHour: number;
  hourHeight: number;
}

function ChronotypeBackgroundDemo({
  chronotypeType,
  startHour,
  endHour,
  hourHeight,
}: ChronotypeBackgroundDemoProps) {
  const profile: ChronotypeProfile = CHRONOTYPE_PRESETS[chronotypeType];
  const visibleZones = getVisibleProductivityZones(profile, startHour, endHour, hourHeight);

  const totalHeight = (endHour - startHour) * hourHeight;

  return (
    <div className="relative" style={{ height: `${totalHeight}px`, width: '100%' }}>
      {/* Hour labels */}
      {Array.from({ length: endHour - startHour }, (_, i) => {
        const hour = startHour + i;
        return (
          <div
            key={hour}
            className="border-border/30 text-muted-foreground absolute right-0 left-0 border-t text-xs"
            style={{ top: `${i * hourHeight}px`, height: `${hourHeight}px` }}
          >
            <span className="bg-background px-1">{`${hour}:00`}</span>
          </div>
        );
      })}

      {/* Chronotype zones */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {visibleZones.map((item, index) => (
          <div
            key={`${item.zone.level}-${item.zone.startHour}-${index}`}
            className={cn(
              'absolute right-0 left-0',
              CHRONOTYPE_LEVEL_TINT_CLASSES[item.zone.level],
            )}
            style={{
              top: `${item.top}px`,
              height: `${item.height}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// All types comparison
// ─────────────────────────────────────────────────────────

const ALL_TYPES: PresetChronotypeType[] = ['lion', 'bear', 'wolf', 'dolphin'];

function AllTypesComparison() {
  const hourHeight = 40;
  const startHour = 5;
  const endHour = 24;

  return (
    <div className="grid grid-cols-2 gap-8">
      {ALL_TYPES.map((type) => (
        <div key={type}>
          <h3 className="text-foreground mb-2 text-sm font-normal">
            {CHRONOTYPE_PRESETS[type].name}
          </h3>
          <div className="border-border overflow-hidden rounded-lg border">
            <ChronotypeBackgroundDemo
              chronotypeType={type}
              startHour={startHour}
              endHour={endHour}
              hourHeight={hourHeight}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Meta & Stories
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Chronotype/ChronotypeBackground',
  component: ChronotypeBackgroundDemo,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    chronotypeType: {
      control: 'select',
      options: ['lion', 'bear', 'wolf', 'dolphin'],
      description: 'Chronotype preset type',
    },
    startHour: {
      control: { type: 'range', min: 0, max: 23, step: 1 },
      description: 'Visible range start hour',
    },
    endHour: {
      control: { type: 'range', min: 1, max: 24, step: 1 },
      description: 'Visible range end hour',
    },
    hourHeight: {
      control: { type: 'range', min: 20, max: 80, step: 4 },
      description: 'Height per hour in pixels',
    },
  },
} satisfies Meta<typeof ChronotypeBackgroundDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bear（標準型）- 勤務時間帯 */
export const Bear: Story = {
  args: {
    chronotypeType: 'bear',
    startHour: 7,
    endHour: 23,
    hourHeight: 48,
  },
};

/** Lion（朝型）- 早朝から表示 */
export const Lion: Story = {
  args: {
    chronotypeType: 'lion',
    startHour: 5,
    endHour: 21,
    hourHeight: 48,
  },
};

/** Wolf（夜型）- 午後から深夜 */
export const Wolf: Story = {
  args: {
    chronotypeType: 'wolf',
    startHour: 10,
    endHour: 24,
    hourHeight: 48,
  },
};

/** Dolphin（不規則型） */
export const Dolphin: Story = {
  args: {
    chronotypeType: 'dolphin',
    startHour: 6,
    endHour: 22,
    hourHeight: 48,
  },
};

/** 全タイプの比較 */
export const Comparison: Story = {
  args: {
    chronotypeType: 'bear',
    startHour: 5,
    endHour: 24,
    hourHeight: 40,
  },
  render: () => <AllTypesComparison />,
};

/** 0-24時フル表示 */
export const FullDay: Story = {
  args: {
    chronotypeType: 'bear',
    startHour: 0,
    endHour: 24,
    hourHeight: 32,
  },
};
