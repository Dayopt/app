import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { NowBadge } from './NowBadge';

/**
 * Now Badge。deep/ease ゾーン内にいるときだけ ↗/↘ アイコン付きテキストを表示。
 */
const meta = {
  title: 'Features/Calendar/Views/Grid/NowBadge',
  component: NowBadge,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof NowBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const enableBearChronotype = () => {
  useCalendarSettingsStore.setState({
    chronotype: { enabled: true, type: 'bear' },
  });
};

const disableChronotype = () => {
  useCalendarSettingsStore.setState({
    chronotype: { enabled: false, type: 'bear' },
  });
};

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** Deep ゾーン内（Bear: 10-14h）。↗ In deep を表示。 */
export const InDeep: Story = {
  args: {
    currentHour: 11,
  },
  decorators: [
    (Story) => {
      enableBearChronotype();
      return (
        <div className="relative h-12 w-48">
          <Story />
        </div>
      );
    },
  ],
};

/** Ease ゾーン内（Bear: 14-16h）。↘ In ease を表示。 */
export const InEase: Story = {
  args: {
    currentHour: 15,
  },
  decorators: [
    (Story) => {
      enableBearChronotype();
      return (
        <div className="relative h-12 w-48">
          <Story />
        </div>
      );
    },
  ],
};

/** ゾーン外（Bear warmup: 8h）。バッジ非表示。 */
export const OutsideZone: Story = {
  args: {
    currentHour: 8,
  },
  decorators: [
    (Story) => {
      enableBearChronotype();
      return (
        <div className="relative h-12 w-48">
          <p className="text-muted-foreground text-xs">（バッジ非表示）</p>
          <Story />
        </div>
      );
    },
  ],
};

/** Chronotype 無効。バッジ非表示。 */
export const ChronotypeDisabled: Story = {
  args: {
    currentHour: 11,
  },
  decorators: [
    (Story) => {
      disableChronotype();
      return (
        <div className="relative h-12 w-48">
          <p className="text-muted-foreground text-xs">（Chronotype OFF — バッジ非表示）</p>
          <Story />
        </div>
      );
    },
  ],
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { currentHour: 11 },
  render: () => {
    enableBearChronotype();
    return (
      <div className="flex flex-col items-start gap-8">
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Deep ゾーン（Bear 11:00）</p>
          <div className="relative h-8 w-48">
            <NowBadge currentHour={11} />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Ease ゾーン（Bear 15:00）</p>
          <div className="relative h-8 w-48">
            <NowBadge currentHour={15} />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">ゾーン外（Bear 8:00）</p>
          <div className="relative h-8 w-48">
            <NowBadge currentHour={8} />
            <span className="text-muted-foreground text-xs">（非表示）</span>
          </div>
        </div>
      </div>
    );
  },
};
