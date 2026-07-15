import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { PlanEvent, PlanEventStatus } from '@/features/timeblock';

import type { TwoLanePosition } from '../../../../../lib/two-lane-layout';

import { PlanLaneCard } from './PlanLaneCard';

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

/** Plan レーン用カード。overview.md §4「過去 Plan の見え方」の全 status variant。 */
const meta = {
  title: 'Product/Features/Calendar/TwoLane/PlanLaneCard',
  component: PlanLaneCard,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    event: makeEvent('upcoming'),
    position: basePosition,
    tagName: 'Deep Work',
  },
  argTypes: { showDayDiffMarker: { control: 'boolean' } },
} satisfies Meta<typeof PlanLaneCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Upcoming: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard
        event={makeEvent('upcoming')}
        position={basePosition}
        tagName="Deep Work"
        tagColor="blue"
      />
    </Slot>
  ),
};

export const Active: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard
        event={makeEvent('active')}
        position={basePosition}
        tagName="Deep Work"
        tagColor="teal"
      />
    </Slot>
  ),
};

/** 過去・未記録・未skip。静かなプロンプト(破線)で示す。 */
export const Unrecorded: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard
        event={makeEvent('unrecorded')}
        position={basePosition}
        tagName="Deep Work"
        tagColor="amber"
      />
    </Slot>
  ),
};

/** 記録済み（records あり）。Record レーンが主役になるため控えめに沈める。 */
export const Recorded: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard
        event={makeEvent('recorded')}
        position={basePosition}
        tagName="Deep Work"
        tagColor="indigo"
      />
    </Slot>
  ),
};

/** skip 済み（やらなかった）。斜線ハッチングで減衰表示。 */
export const Skipped: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard
        event={makeEvent('skipped')}
        position={basePosition}
        tagName="Deep Work"
        tagColor="gray"
      />
    </Slot>
  ),
};

/** タグ未設定。title は表示へフォールバックしない。 */
export const NoTag: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard
        event={makeEvent('upcoming')}
        position={basePosition}
        tagName={null}
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
        tagName="Deep Work"
        tagColor="red"
      />
    </Slot>
  ),
};

/** Compare panel に表示中のPlan。 */
export const CompareTarget: Story = {
  render: () => (
    <Slot>
      <PlanLaneCard
        event={makeEvent('recorded')}
        position={basePosition}
        tagName="Deep Work"
        tagColor="indigo"
        showDayDiffMarker
      />
    </Slot>
  ),
};

/** Week / multi-day の狭い Plan レーン。 */
export const NarrowLane: Story = {
  render: () => (
    <div className="border-border relative h-24 w-12 overflow-hidden rounded-lg border">
      <PlanLaneCard
        event={makeEvent('upcoming', { title: 'デザインレビュー' })}
        position={{ ...basePosition, left: 0, width: 100 }}
        tagName="Deep Work"
        tagColor="blue"
        compact
      />
    </div>
  ),
};

/** 全パターン一覧。 */
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
        <Slot key={status}>
          <PlanLaneCard
            event={makeEvent(status)}
            position={basePosition}
            tagName="Deep Work"
            tagColor={color}
            showDayDiffMarker={status === 'recorded'}
          />
        </Slot>
      ))}
      <div className="border-border relative h-24 w-12 overflow-hidden rounded-lg border">
        <PlanLaneCard
          event={makeEvent('upcoming', { title: 'デザインレビュー' })}
          position={{ ...basePosition, left: 0, width: 100 }}
          tagName="Deep Work"
          tagColor="blue"
          compact
        />
      </div>
    </div>
  ),
};
