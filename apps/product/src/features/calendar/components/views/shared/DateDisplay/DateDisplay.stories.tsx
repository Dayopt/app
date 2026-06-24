import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { addDays } from 'date-fns';

import { DateDisplay } from './DateDisplay';

/** カレンダーの日付表示コンポーネント（DateDisplay）。 */
const meta = {
  title: 'Product/Features/Calendar/DateDisplay',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

const today = new Date();
const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);

// ---------------------------------------------------------------------------
// DateDisplay
// ---------------------------------------------------------------------------

/** 通常の日付表示。曜日 + 日付数字。 */
export const Default: Story = {
  render: () => <DateDisplay date={yesterday} />,
};

/** 今日の日付。青丸ハイライト。 */
export const Today: Story = {
  render: () => <DateDisplay date={today} isToday />,
};

/** 選択状態。 */
export const Selected: Story = {
  render: () => <DateDisplay date={tomorrow} isSelected />,
};

// ---------------------------------------------------------------------------
// 全パターン一覧
// ---------------------------------------------------------------------------

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="flex items-end gap-4">
        <DateDisplay date={yesterday} />
        <DateDisplay date={today} isToday />
        <DateDisplay date={tomorrow} isSelected />
      </div>
    </div>
  ),
};
