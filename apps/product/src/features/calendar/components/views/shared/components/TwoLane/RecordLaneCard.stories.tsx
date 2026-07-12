import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { RecordEvent } from '@/features/timeblock';

import type { TwoLanePosition } from '../../../../../lib/two-lane-layout';

import { RecordLaneCard } from './RecordLaneCard';

/**
 * Log レーン用カード。塗り(主役)+差分バッジ(±0非表示)+予定外マーカーの全 variant。
 */
const meta = {
  title: 'Product/Features/Calendar/TwoLane/RecordLaneCard',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Slot({ children, height = 90 }: { children: React.ReactNode; height?: number }) {
  return (
    <div
      className="border-border relative w-40 overflow-hidden rounded-lg border"
      style={{ height }}
    >
      {children}
    </div>
  );
}

const basePosition: TwoLanePosition = { top: 8, height: 70, left: 4, width: 92 };

function makeEvent(overrides: Partial<RecordEvent> = {}): RecordEvent {
  const start = new Date(2026, 6, 15, 10, 0);
  const end = new Date(2026, 6, 15, 11, 0);
  return {
    id: 'log-1',
    title: 'Deep Work',
    note: null,
    tagId: 'tag-1',
    planId: 'plan-1',
    startDate: start,
    endDate: end,
    displayStartDate: start,
    displayEndDate: end,
    duration: 60,
    fulfillmentScore: null,
    ...overrides,
  };
}

/** plan_id あり・差分なし(±0)。バッジは表示しない。 */
export const RecordedNoDiff: Story = {
  render: () => (
    <Slot>
      <RecordLaneCard
        event={makeEvent({ diffMinutes: 0 })}
        position={basePosition}
        tagColor="blue"
      />
    </Slot>
  ),
};

/** 予定より長くかかった（実績超過）。 */
export const Overtime: Story = {
  render: () => (
    <Slot>
      <RecordLaneCard
        event={makeEvent({ diffMinutes: 20 })}
        position={basePosition}
        tagColor="teal"
      />
    </Slot>
  ),
};

/** 予定より短く終わった（前倒し）。 */
export const Early: Story = {
  render: () => (
    <Slot>
      <RecordLaneCard
        event={makeEvent({ diffMinutes: -15 })}
        position={basePosition}
        tagColor="amber"
      />
    </Slot>
  ),
};

/** 予定外の記録（planId なし）。静かなマーカーのみ、判定ラベルは使わない。 */
export const Unplanned: Story = {
  render: () => (
    <Slot>
      <RecordLaneCard
        event={makeEvent({ planId: null, diffMinutes: undefined })}
        position={basePosition}
        tagColor="violet"
      />
    </Slot>
  ),
};

/** タイトル未設定。 */
export const Untitled: Story = {
  render: () => (
    <Slot>
      <RecordLaneCard
        event={makeEvent({ title: '', diffMinutes: 0 })}
        position={basePosition}
        tagColor="gray"
      />
    </Slot>
  ),
};

/** 低い高さ。時間表示を省略する。 */
export const Compact: Story = {
  render: () => (
    <Slot height={40}>
      <RecordLaneCard
        event={makeEvent({ diffMinutes: 10 })}
        position={{ ...basePosition, height: 24 }}
        tagColor="red"
      />
    </Slot>
  ),
};

export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-4">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">差分なし</p>
        <Slot>
          <RecordLaneCard
            event={makeEvent({ diffMinutes: 0 })}
            position={basePosition}
            tagColor="blue"
          />
        </Slot>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">超過(+20min)</p>
        <Slot>
          <RecordLaneCard
            event={makeEvent({ diffMinutes: 20 })}
            position={basePosition}
            tagColor="teal"
          />
        </Slot>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">前倒し(-15min)</p>
        <Slot>
          <RecordLaneCard
            event={makeEvent({ diffMinutes: -15 })}
            position={basePosition}
            tagColor="amber"
          />
        </Slot>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">予定外</p>
        <Slot>
          <RecordLaneCard
            event={makeEvent({ planId: null, diffMinutes: undefined })}
            position={basePosition}
            tagColor="violet"
          />
        </Slot>
      </div>
    </div>
  ),
};
