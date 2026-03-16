import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { StatsDateDisplay } from './StatsDateDisplay';

/** StatsDateDisplay — 粒度に応じた日付コンテキストを表示（週番号付き） */
const meta = {
  title: 'Features/Stats/Shared/DateDisplay',
  component: StatsDateDisplay,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StatsDateDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 日粒度（年月日 + 週番号を表示） */
export const Day: Story = {
  args: {
    currentDate: new Date(2026, 2, 16),
    granularity: 'day',
  },
};

/** 週粒度（年月 + 週番号を表示） */
export const Week: Story = {
  args: {
    currentDate: new Date(2026, 2, 16),
    granularity: 'week',
  },
};

/** 月粒度（年月のみ表示） */
export const Month: Story = {
  args: {
    currentDate: new Date(2026, 2, 16),
    granularity: 'month',
  },
};

/** 年粒度（年のみ表示） */
export const Year: Story = {
  args: {
    currentDate: new Date(2026, 2, 16),
    granularity: 'year',
  },
};
