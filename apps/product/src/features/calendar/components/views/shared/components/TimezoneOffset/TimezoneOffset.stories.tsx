import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PRESET_USER_SETTINGS } from '@dayopt/storybook/mocks/presets';
import { StoryTRPCProvider } from '@dayopt/storybook/mocks/trpc';

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

const withTimezone = (timezone: string) => ({
  'userSettings.get': { ...PRESET_USER_SETTINGS.default, timezone },
});

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示（Asia/Tokyo = UTC+9）。 */
export const Default: Story = {
  parameters: { trpcMocks: withTimezone('Asia/Tokyo') },
};

/** UTC+0（ロンドン）。 */
export const UTC: Story = {
  parameters: { trpcMocks: withTimezone('Europe/London') },
};

/** UTC-5（ニューヨーク）。 */
export const NewYork: Story = {
  parameters: { trpcMocks: withTimezone('America/New_York') },
};

/** UTC-8（ロサンゼルス）。 */
export const LosAngeles: Story = {
  parameters: { trpcMocks: withTimezone('America/Los_Angeles') },
};

/** カスタムクラス付き。 */
export const WithClassName: Story = {
  args: {
    className: 'text-foreground',
  },
  parameters: { trpcMocks: withTimezone('Asia/Tokyo') },
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
        {timezones.map(({ label, tz }) => (
          <StoryTRPCProvider key={tz} mocks={withTimezone(tz)}>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground w-52 text-xs">{label}</span>
              <TimezoneOffset />
            </div>
          </StoryTRPCProvider>
        ))}
      </div>
    );
  },
};
