import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { UnconfirmedPlanList, type UnconfirmedPlanRow } from './UnconfirmedPlanList';

const ROWS: UnconfirmedPlanRow[] = [
  { id: '1', title: 'Deep Work', timeLabel: '9:00–10:30', color: 'blue', icon: null },
  { id: '2', title: 'Meeting', timeLabel: '11:00–12:00', color: 'amber', icon: null },
  { id: '3', title: '仕事:レビュー', timeLabel: '14:00–15:00', color: 'violet', icon: null },
];

/** UnconfirmedPlanList — 確認待ちの予定リスト（採点 = 確認で行が消える） */
const meta = {
  title: 'Features/Stats/Review/UnconfirmedPlanList',
  component: UnconfirmedPlanList,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof UnconfirmedPlanList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本表示: 複数の確認待ち */
export const Default: Story = {
  args: {
    rows: ROWS,
    onScore: () => {},
  },
};

/** 1 件だけ残っている状態 */
export const SingleRow: Story = {
  args: {
    rows: [ROWS[0]!],
    onScore: () => {},
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { rows: ROWS, onScore: () => {} },
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Default（複数件）</p>
        <UnconfirmedPlanList rows={ROWS} onScore={() => {}} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">SingleRow（残り 1 件）</p>
        <UnconfirmedPlanList rows={[ROWS[0]!]} onScore={() => {}} />
      </div>
    </div>
  ),
};
