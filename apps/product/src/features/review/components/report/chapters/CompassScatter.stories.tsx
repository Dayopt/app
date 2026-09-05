import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CompassScatter } from './CompassScatter';

import type { ReportCompassPoint } from '../../../domain/report/report-view-model';

/**
 * 羅針盤の盤だけを見る Story。目盛りと数値を持たず、四隅のヒントは 2 つだけ。
 */
const meta = {
  title: 'Product/Features/Review/Chapters/CompassScatter',
  component: CompassScatter,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CompassScatter>;

export default meta;
type Story = StoryObj<typeof meta>;

function point(overrides: Partial<ReportCompassPoint> = {}): ReportCompassPoint {
  return {
    activityId: 'act-write',
    name: '執筆',
    categoryName: '仕事',
    color: 'blue',
    x: 50,
    y: 50,
    opacity: 1,
    answerCount: 5,
    recordedMinutes: 300,
    ...overrides,
  };
}

export const Default: Story = {
  args: {
    points: [
      point({ x: 92, y: 78, answerCount: 9 }),
      point({ activityId: 'b', name: 'メール', color: 'violet', x: 34, y: 22, opacity: 0.74 }),
      point({ activityId: 'c', name: '読書', color: 'green', x: 18, y: 66, opacity: 0.61 }),
    ],
  },
};

/** 濃度の差だけを見る Story（回答が 1・3・5 件以上）。 */
export const OpacityLadder: Story = {
  args: {
    points: [
      point({ activityId: 'a', name: '5 回', x: 20, y: 30, opacity: 0.35 + 5 * 0.13 }),
      point({ activityId: 'b', name: '7 回', x: 50, y: 50, opacity: 0.35 + 5 * 0.13 }),
      point({ activityId: 'c', name: '9 回', x: 80, y: 70, opacity: 0.35 + 5 * 0.13 }),
    ],
  },
};

/** 右端に寄った点。ラベルが盤からはみ出さないよう左寄せへ倒れる（仕様 §13-14）。 */
export const RightEdgeLabels: Story = {
  args: {
    points: [
      point({ activityId: 'a', name: '長い名前のアクティビティ', x: 92, y: 20 }),
      point({ activityId: 'b', name: '短い', x: 71, y: 60 }),
    ],
  },
};

/** 点が 1 つも無い盤。 */
export const Empty: Story = { args: { points: [] } };

/** すべての状態を 1 画面に並べる（ADR-023 の AllPatterns）。 */
export const AllPatterns: Story = {
  args: { points: [] },
  render: function AllPatternsCompass() {
    return (
      <div className="flex flex-col gap-6">
        <Row label="通常（3 点）">
          <CompassScatter points={Default.args?.points ?? []} />
        </Row>
        <Row label="濃度の階段（回答数の差）">
          <CompassScatter points={OpacityLadder.args?.points ?? []} />
        </Row>
        <Row label="右端の点（ラベルが左寄せへ倒れる）">
          <CompassScatter points={RightEdgeLabels.args?.points ?? []} />
        </Row>
        <Row label="点なし">
          <CompassScatter points={[]} />
        </Row>
        <Row label="狭い面（320px）">
          <div className="w-[320px]">
            <CompassScatter points={Default.args?.points ?? []} />
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
