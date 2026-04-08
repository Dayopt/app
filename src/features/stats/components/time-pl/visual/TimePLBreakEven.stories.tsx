import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TimePLBreakEven } from './TimePLBreakEven';
import {
  MOCK_BE_DAY,
  MOCK_BE_MONTH,
  MOCK_BE_WEEK_CROSSOVER,
  MOCK_BE_WEEK_OVER,
  MOCK_BE_WEEK_UNDER,
} from './timePLBreakEven.mocks';

/** 損益分岐点グラフ — 累積予算 vs 累積実績の推移と交差を可視化 */
const meta = {
  title: 'Features/Stats/TimePL/Visual/BreakEven',
  component: TimePLBreakEven,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimePLBreakEven>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 週次: 水曜で交差、最終的に超過 */
export const Default: Story = {
  args: { data: MOCK_BE_WEEK_CROSSOVER },
};

/** 週次: 実績が常に予算以下（余裕ゾーンのみ） */
export const AlwaysUnder: Story = {
  args: { data: MOCK_BE_WEEK_UNDER },
};

/** 週次: 実績が常に予算超過（超過ゾーンのみ） */
export const AlwaysOver: Story = {
  args: { data: MOCK_BE_WEEK_OVER },
};

/** 月次: 31日分、複数回交差 */
export const Monthly: Story = {
  args: { data: MOCK_BE_MONTH },
};

/** 日次: 時間帯別（午前/昼/午後/夜） */
export const Daily: Story = {
  args: { data: MOCK_BE_DAY },
};

/** データなし */
export const Empty: Story = {
  args: { data: null },
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  args: { data: MOCK_BE_WEEK_CROSSOVER },
  render: () => (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">交差あり（週次）</p>
        <TimePLBreakEven data={MOCK_BE_WEEK_CROSSOVER} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">常に予算以下（余裕のみ）</p>
        <TimePLBreakEven data={MOCK_BE_WEEK_UNDER} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">常に予算超過（超過のみ）</p>
        <TimePLBreakEven data={MOCK_BE_WEEK_OVER} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">月次（31日間）</p>
        <TimePLBreakEven data={MOCK_BE_MONTH} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">日次（時間帯別）</p>
        <TimePLBreakEven data={MOCK_BE_DAY} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">Empty</p>
        <TimePLBreakEven data={null} />
      </div>
    </div>
  ),
};
