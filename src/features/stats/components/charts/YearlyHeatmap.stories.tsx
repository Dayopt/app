import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { YearlyHeatmap } from './YearlyHeatmap';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

const MOCK_DAILY_DATA = [
  { day: '2026-01-05', hours: 6.0 },
  { day: '2026-01-06', hours: 4.5 },
  { day: '2026-01-07', hours: 7.2 },
  { day: '2026-01-08', hours: 5.1 },
  { day: '2026-01-09', hours: 3.8 },
  { day: '2026-01-12', hours: 6.5 },
  { day: '2026-01-13', hours: 8.0 },
  { day: '2026-02-02', hours: 7.0 },
  { day: '2026-02-03', hours: 6.2 },
  { day: '2026-02-04', hours: 1.5 },
  { day: '2026-02-17', hours: 8.5 },
  { day: '2026-03-02', hours: 7.5 },
  { day: '2026-03-03', hours: 5.0 },
  { day: '2026-03-10', hours: 7.8 },
  { day: '2026-03-17', hours: 8.0 },
];

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** YearlyHeatmap — 年間のアクティビティをCSS gridヒートマップで表示 */
const meta = {
  title: 'Features/Stats/Progress/CalendarHeatmap',
  component: YearlyHeatmap,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof YearlyHeatmap>;

export default meta;
type Story = StoryObj<typeof meta>;

/** データあり */
export const WithData: Story = {
  parameters: {
    trpcMocks: { 'entries.getDailyHours': MOCK_DAILY_DATA },
  },
};

/** データなし */
export const Empty: Story = {
  parameters: {
    trpcMocks: { 'entries.getDailyHours': [] },
  },
};
