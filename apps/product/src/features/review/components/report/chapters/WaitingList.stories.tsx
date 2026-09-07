import { WaitingList } from './WaitingList';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

/**
 * 3 章「点になるのを待っているもの」。
 *
 * 充実の回答が 5 件に満たないアクティビティを名前だけ並べる。**催促しない** —
 * 「回答しましょう」ではなく、待っている事実だけを置く（仕様 §0-2）。
 */
const meta = {
  title: 'Product/Features/Review/Chapters/WaitingList',
  component: WaitingList,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof WaitingList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    activities: [
      { activityId: 'act-gym', name: '運動' },
      { activityId: 'act-chore', name: '家事' },
    ],
  },
};

export const SingleActivity: Story = {
  args: { activities: [{ activityId: 'act-gym', name: '運動' }] },
};

/** アクティビティ未設定の記録。名前の代わりに「名前なし」を出す。 */
export const Unnamed: Story = {
  args: {
    activities: [
      { activityId: null, name: null },
      { activityId: 'act-read', name: '読書' },
    ],
  },
};

/** 待っているものが無い週。**節ごと出さない**（空文言も置かない）。 */
export const Empty: Story = { args: { activities: [] } };

/** すべての状態を 1 画面に並べる（ADR-023 の AllPatterns）。 */
export const AllPatterns: Story = {
  args: { activities: [] },
  render: function AllPatternsWaitingList() {
    const many = Array.from({ length: 9 }, (_, index) => ({
      activityId: `act-${index}`,
      name: `アクティビティ ${index + 1}`,
    }));
    return (
      <div className="flex flex-col gap-6">
        <Row label="複数">
          <WaitingList
            activities={[
              { activityId: 'act-gym', name: '運動' },
              { activityId: 'act-chore', name: '家事' },
            ]}
          />
        </Row>
        <Row label="1 件">
          <WaitingList activities={[{ activityId: 'act-gym', name: '運動' }]} />
        </Row>
        <Row label="アクティビティ未設定を含む">
          <WaitingList
            activities={[
              { activityId: null, name: null },
              { activityId: 'act-read', name: '読書' },
            ]}
          />
        </Row>
        <Row label="多い（折り返す）">
          <div className="w-[320px]">
            <WaitingList activities={many} />
          </div>
        </Row>
        <Row label="0 件（節ごと出さない = 何も描かれない）">
          <WaitingList activities={[]} />
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
