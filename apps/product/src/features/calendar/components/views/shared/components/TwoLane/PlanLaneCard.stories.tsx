import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { PlanEvent, PlanEventStatus } from '@/features/timeblock';

import type { TwoLanePosition } from '../../../../../lib/two-lane-layout';

import { PlanLaneCard } from './PlanLaneCard';

/** Plan レーン用カード。overview.md §4「過去 Plan の見え方」の全 status variant。 */
const meta = {
  title: 'Product/Features/Calendar/TwoLane/PlanLaneCard',
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

function makeEvent(status: PlanEventStatus, overrides: Partial<PlanEvent> = {}): PlanEvent {
  const start = new Date(2026, 6, 15, 10, 0);
  const end = new Date(2026, 6, 15, 11, 0);
  return {
    id: `plan-${status}`,
    title: 'Deep Work',
    note: null,
    tagId: 'tag-1',
    startDate: start,
    endDate: end,
    displayStartDate: start,
    displayEndDate: end,
    duration: 60,
    status,
    ...overrides,
  };
}

export const Upcoming: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard event={makeEvent('upcoming')} position={basePosition} tagColor="blue" />
    </Slot>
  ),
};

export const Active: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard event={makeEvent('active')} position={basePosition} tagColor="teal" />
    </Slot>
  ),
};

/** 過去・未記録・未skip。静かなプロンプト(破線)で示す。 */
export const Unrecorded: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard event={makeEvent('unrecorded')} position={basePosition} tagColor="amber" />
    </Slot>
  ),
};

/** 記録済み（records あり）。Record レーンが主役になるため控えめに沈める。 */
export const Recorded: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard event={makeEvent('recorded')} position={basePosition} tagColor="indigo" />
    </Slot>
  ),
};

/** skip 済み（やらなかった）。斜線ハッチングで減衰表示。 */
export const Skipped: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard event={makeEvent('skipped')} position={basePosition} tagColor="gray" />
    </Slot>
  ),
};

/** タイトル未設定。 */
export const Untitled: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard
        event={makeEvent('upcoming', { title: '' })}
        position={basePosition}
        tagColor="violet"
      />
    </Slot>
  ),
};

/** 低い高さ(20px相当)。時間表示を省略する。 */
export const Compact: Story = {
  render: () => (
    <Slot height={40}>
      <PlanLaneCard
        event={makeEvent('upcoming')}
        position={{ ...basePosition, height: 24 }}
        tagColor="red"
      />
    </Slot>
  ),
};

export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-4">
      {(
        [
          ['upcoming', 'blue'],
          ['active', 'teal'],
          ['unrecorded', 'amber'],
          ['recorded', 'indigo'],
          ['skipped', 'gray'],
        ] as const
      ).map(([status, color]) => (
        <div key={status} className="space-y-2">
          <p className="text-muted-foreground text-xs">{status}</p>
          <Slot>
            <PlanLaneCard event={makeEvent(status)} position={basePosition} tagColor={color} />
          </Slot>
        </div>
      ))}
    </div>
  ),
};
