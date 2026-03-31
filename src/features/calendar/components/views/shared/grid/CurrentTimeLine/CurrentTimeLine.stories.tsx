import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CurrentTimeLine, CurrentTimeLineForColumn } from './CurrentTimeLine';

/**
 * 現在時刻インジケーター線。dot(6px) + bar(2px) 構造、bg-now-indicator 色。日ビュー用（全幅）とカラム用（列内）の2バリアント。startHour/endHour で範囲外非表示。
 */
const meta = {
  title: 'Features/Calendar/Views/Grid/CurrentTimeLine',
  component: CurrentTimeLine,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof CurrentTimeLine>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

const today = new Date();
today.setHours(0, 0, 0, 0);

const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);

const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト（日ビュー・今日・全幅表示）。ドット付き。 */
export const Default: Story = {
  args: {
    hourHeight: 72,
    showDot: true,
  },
  decorators: [
    (Story) => (
      <div className="bg-background border-border relative h-32 w-full overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

/** ドットなし。 */
export const WithoutDot: Story = {
  args: {
    hourHeight: 72,
    showDot: false,
  },
  decorators: [
    (Story) => (
      <div className="bg-background border-border relative h-32 w-full overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

/** 週ビュー（複数日）。今日を含む場合——今日の列のみ濃い線+ドット。 */
export const WeekViewWithToday: Story = {
  args: {
    hourHeight: 72,
    showDot: true,
    displayDates: [yesterday, today, tomorrow],
    viewMode: 'week',
  },
  decorators: [
    (Story) => (
      <div className="bg-background border-border relative h-32 w-full overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

/** 週ビュー（今日を含まない）。薄い全幅線が表示される。 */
export const WeekViewWithoutToday: Story = {
  args: {
    hourHeight: 72,
    showDot: true,
    displayDates: [yesterday, new Date(yesterday.getTime() - 86400000)],
    viewMode: 'week',
    showOnOtherDays: true,
  },
  decorators: [
    (Story) => (
      <div className="bg-background border-border relative h-32 w-full overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

/** カラム用（列内）・今日。ドット表示あり。 */
export const ForColumnToday: Story = {
  render: () => (
    <div className="bg-background border-border relative h-32 w-48 overflow-hidden rounded-lg border">
      <CurrentTimeLineForColumn hourHeight={72} showDot isToday />
    </div>
  ),
};

/** カラム用（列内）・今日以外。薄い線のみ。 */
export const ForColumnOtherDay: Story = {
  render: () => (
    <div className="bg-background border-border relative h-32 w-48 overflow-hidden rounded-lg border">
      <CurrentTimeLineForColumn hourHeight={72} showDot={false} isToday={false} showOnOtherDays />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="w-full space-y-2">
        <p className="text-muted-foreground text-xs font-medium">日ビュー（全幅・ドット付き）</p>
        <div className="bg-background border-border relative h-20 w-full overflow-hidden rounded-lg border">
          <CurrentTimeLine hourHeight={72} showDot />
        </div>
      </div>
      <div className="w-full space-y-2">
        <p className="text-muted-foreground text-xs font-medium">週ビュー（複数日・今日を含む）</p>
        <div className="bg-background border-border relative h-20 w-full overflow-hidden rounded-lg border">
          <CurrentTimeLine hourHeight={72} showDot displayDates={[yesterday, today, tomorrow]} />
        </div>
      </div>
      <div className="w-full space-y-2">
        <p className="text-muted-foreground text-xs font-medium">カラム用・今日</p>
        <div className="bg-background border-border relative h-20 w-64 overflow-hidden rounded-lg border">
          <CurrentTimeLineForColumn hourHeight={72} showDot isToday />
        </div>
      </div>
      <div className="w-full space-y-2">
        <p className="text-muted-foreground text-xs font-medium">カラム用・今日以外（薄い線）</p>
        <div className="bg-background border-border relative h-20 w-64 overflow-hidden rounded-lg border">
          <CurrentTimeLineForColumn
            hourHeight={72}
            showDot={false}
            isToday={false}
            showOnOtherDays
          />
        </div>
      </div>
    </div>
  ),
};
