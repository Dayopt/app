import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import type { MobileWeekDisplayMode } from '@/features/calendar/stores/useCalendarDisplayModeStore';

import { MobileWeekLaneSwitcher } from './MobileWeekLaneSwitcher';

const meta = {
  title: 'Product/Features/Calendar/Views/WeekView/MobileWeekLaneSwitcher',
  component: MobileWeekLaneSwitcher,
  parameters: { layout: 'padded' },
  globals: { viewport: { value: 'mobile1' } },
  tags: ['autodocs'],
  args: {
    value: 'recorded',
    onValueChange: fn(),
  },
  argTypes: {
    value: { control: 'radio', options: ['planned', 'recorded'] },
  },
} satisfies Meta<typeof MobileWeekLaneSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 記録を表示する既定状態。 */
export const Recorded: Story = {};

/** 予定を表示する状態。 */
export const Planned: Story = { args: { value: 'planned' } };

/** タップで表示対象を切り替える。 */
export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState<MobileWeekDisplayMode>('recorded');
    return <MobileWeekLaneSwitcher value={value} onValueChange={setValue} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const planButton = canvas.getByRole('button', { name: /Plan|予定/ });
    await userEvent.click(planButton);
    await expect(planButton).toHaveAttribute('aria-pressed', 'true');
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <MobileWeekLaneSwitcher value="recorded" onValueChange={fn()} />
      <MobileWeekLaneSwitcher value="planned" onValueChange={fn()} />
    </div>
  ),
};
