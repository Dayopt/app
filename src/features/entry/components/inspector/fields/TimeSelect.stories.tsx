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
