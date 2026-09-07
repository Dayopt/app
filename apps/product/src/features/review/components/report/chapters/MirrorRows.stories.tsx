import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MirrorRows } from './MirrorRows';

import type { ReportMirrorRow } from '../../../domain/report/report-view-model';

/**
 * 見積もりの鏡。癖の強い順に最大 3 件で、良し悪しの色は付けない。
 */
const meta = {
  title: 'Product/Features/Review/Chapters/MirrorRows',
  component: MirrorRows,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MirrorRows>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeRows: Story = {
  args: {
    rows: [
      {
        activityId: 'a',
        name: '執筆',
        categoryName: '仕事',
        color: 'blue',
        coefficient: 1.31,
        tone: 'over',
      },
      {
        activityId: 'b',
        name: 'メール',
        categoryName: '仕事',
        color: 'violet',
        coefficient: 0.72,
        tone: 'under',
      },
      {
        activityId: 'c',
        name: '読書',
        categoryName: '学習',
        color: 'green',
        coefficient: 1.02,
        tone: 'onPlan',
      },
    ] satisfies ReportMirrorRow[],
  },
};

export const OneRow: Story = {
  args: {
    rows: [
      {
        activityId: 'a',
        name: '執筆',
        categoryName: '仕事',
        color: 'blue',
        coefficient: 1.44,
        tone: 'over',
      },
    ],
  },
};

/** 候補 0 件。責めず、催促もしない一文を置く。 */
export const Empty: Story = { args: { rows: [] } };

/** すべての状態を 1 画面に並べる（ADR-023 の AllPatterns）。 */
export const AllPatterns: Story = {
  args: { rows: [] },
  render: function AllPatternsMirrorRows() {
    const rows = ThreeRows.args?.rows ?? [];
    return (
      <div className="flex flex-col gap-6">
        <Row label="3 件（伸びる / 切り上げがち / 予定どおり）">
          <MirrorRows rows={rows} />
        </Row>
        <Row label="1 件だけ">
          <MirrorRows rows={rows.slice(0, 1)} />
        </Row>
        <Row label="候補なし（責めず催促しない一文）">
          <MirrorRows rows={[]} />
        </Row>
        <Row label="狭い面（320px）">
          <div className="w-[320px]">
            <MirrorRows rows={rows} />
          </div>
        </Row>
      </div>
    );
  },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      {children}
    </div>
  );
}
