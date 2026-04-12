import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { useCalendarSettingsStore } from '@/features/calendar/stores/useCalendarSettingsStore';

import { TimezoneOffset } from './TimezoneOffset';

/** タイムゾーン選択セレクト。カレンダーグリッドの時刻列に表示するUTCオフセット表示。 */
const meta = {
  title: 'Features/Calendar/TimezoneOffset',
  component: TimezoneOffset,
  parameters: {
    layout: 'padded',
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TimezoneOffset>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示（Asia/Tokyo = UTC+9）。 */
export const Default: Story = {
  decorators: [
    (Story) => {
      useCalendarSettingsStore.setState({ timezone: 'Asia/Tokyo' });
      return <Story />;
    },
  ],
};

/** UTC+0（ロンドン）。 */
export const UTC: Story = {
  decorators: [
    (Story) => {
      useCalendarSettingsStore.setState({ timezone: 'Europe/London' });
      return <Story />;
    },
  ],
};

/** UTC-5（ニューヨーク）。 */
export const NewYork: Story = {
  decorators: [
    (Story) => {
      useCalendarSettingsStore.setState({ timezone: 'America/New_York' });
      return <Story />;
    },
  ],
};

/** UTC-8（ロサンゼルス）。 */
export const LosAngeles: Story = {
  decorators: [
    (Story) => {
      useCalendarSettingsStore.setState({ timezone: 'America/Los_Angeles' });
      return <Story />;
    },
  ],
};

/** カスタムクラス付き。 */
export const WithClassName: Story = {
  args: {
    className: 'text-foreground',
  },
  decorators: [
    (Story) => {
      useCalendarSettingsStore.setState({ timezone: 'Asia/Tokyo' });
      return <Story />;
    },
  ],
};

/** 全パターン一覧（各タイムゾーン）。 */
export const AllPatterns: Story = {
  render: () => {
    const timezones = [
      { label: 'Asia/Tokyo (UTC+9)', tz: 'Asia/Tokyo' },
      { label: 'Europe/London (UTC±0)', tz: 'Europe/London' },
      { label: 'America/New_York (UTC-5)', tz: 'America/New_York' },
      { label: 'America/Los_Angeles (UTC-8)', tz: 'America/Los_Angeles' },
      { label: 'Asia/Kolkata (UTC+5:30)', tz: 'Asia/Kolkata' },
    ];

    return (
      <div className="flex flex-col gap-4">
        {timezones.map(({ label, tz }) => {
          useCalendarSettingsStore.setState({ timezone: tz });
          return (
            <div key={tz} className="flex items-center gap-4">
              <span className="text-muted-foreground w-52 text-xs">{label}</span>
              <TimezoneOffset />
            </div>
          );
        })}
      </div>
    );
  },
};
