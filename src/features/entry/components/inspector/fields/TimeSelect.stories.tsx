import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { TimeSelect } from './TimeSelect';

const meta = {
  title: 'Features/Entry/Inspector/TimeSelect',
  component: TimeSelect,
  tags: ['autodocs'],
} satisfies Meta<typeof TimeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  // aria-dialog-name: Radix Popover portal has role="dialog" without accessible name
  parameters: { a11y: { test: 'todo' } },
  args: {
    value: '10:00',
    onChange: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = canvas.getByRole('combobox');
    await userEvent.click(combobox);

    // Dropdown should open with time options (use findByRole for async portal)
    const body = within(document.body);
    const option = await body.findByRole('option', { name: '10:30' });
    await expect(option).toBeInTheDocument();
  },
};

export const WithIcon: Story = {
  args: {
    value: '09:30',
    onChange: fn(),
    showIcon: true,
    iconType: 'clock',
  },
};

export const WithDuration: Story = {
  args: {
    value: '10:00',
    onChange: fn(),
    minTime: '09:00',
    showDurationInMenu: true,
  },
};

export const Disabled: Story = {
  args: {
    value: '10:00',
    onChange: fn(),
    disabled: true,
  },
};

export const WithError: Story = {
  args: {
    value: '10:00',
    onChange: fn(),
    hasError: true,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  parameters: { a11y: { test: 'todo' } },
  args: {
    value: '10:00',
    onChange: fn(),
  },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground mb-3 text-xs font-medium">Default</p>
      <TimeSelect value="10:00" onChange={fn()} />
      <p className="text-muted-foreground mb-3 text-xs font-medium">WithIcon（アイコンあり）</p>
      <TimeSelect value="09:30" onChange={fn()} showIcon={true} iconType="clock" />
      <p className="text-muted-foreground mb-3 text-xs font-medium">WithDuration（所要時間表示）</p>
      <TimeSelect value="10:00" onChange={fn()} minTime="09:00" showDurationInMenu={true} />
      <p className="text-muted-foreground mb-3 text-xs font-medium">Disabled（無効状態）</p>
      <TimeSelect value="10:00" onChange={fn()} disabled={true} />
      <p className="text-muted-foreground mb-3 text-xs font-medium">WithError（エラー状態）</p>
      <TimeSelect value="10:00" onChange={fn()} hasError={true} />
    </div>
  ),
};
