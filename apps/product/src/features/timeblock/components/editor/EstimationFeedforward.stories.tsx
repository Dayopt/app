import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { EstimationFeedforward } from './EstimationFeedforward';

/** 直近 4 週の中央値が 1.5 倍のタグ（n=4）。 */
const FACTORS = [
  { tagId: 'tag-work', factor: 1.5, sampleCount: 4 },
  { tagId: 'tag-learning', factor: 0.75, sampleCount: 6 },
];

const withFactors = { trpcMocks: { 'statistics.getTagEstimationFactors': FACTORS } };

const meta = {
  title: 'Product/Features/Timeblock/EstimationFeedforward',
  component: EstimationFeedforward,
  tags: ['autodocs'],
  parameters: { layout: 'padded', ...withFactors },
  args: {
    destination: 'plan',
    tagId: 'tag-work',
    draftMinutes: 30,
  },
} satisfies Meta<typeof EstimationFeedforward>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 見積もりより長くかかる傾向のタグ（1.5 倍 × 30 分 = 45 分）。 */
export const LongerThanPlanned: Story = {};

/** 見積もりより短く終わる傾向のタグ（0.75 倍 × 60 分 = 45 分）。 */
export const ShorterThanPlanned: Story = {
  args: { tagId: 'tag-learning', draftMinutes: 60 },
};

/** 保存先が Record のときは出さない（過去の事実に見積もりの話は要らない）。 */
export const RecordDestination: Story = {
  args: { destination: 'record' },
};

/** タグ未選択では出さない。 */
export const NoTag: Story = {
  args: { tagId: null },
};

/** サンプルが 3 件未満のタグは server が返さないので出ない。 */
export const InsufficientSamples: Story = {
  args: { tagId: 'tag-life' },
};

/** 取得に失敗しても ErrorState を出さず、静かに消える。 */
export const QueryFailed: Story = {
  parameters: { trpcMocks: { 'statistics.getTagEstimationFactors': undefined } },
};

/** 全パターン一覧。何も出ないケースは高さ 0 になる。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <EstimationFeedforward destination="plan" tagId="tag-work" draftMinutes={30} />
      <EstimationFeedforward destination="plan" tagId="tag-learning" draftMinutes={60} />
      <EstimationFeedforward destination="plan" tagId="tag-work" draftMinutes={120} />
      <EstimationFeedforward destination="record" tagId="tag-work" draftMinutes={30} />
      <EstimationFeedforward destination="plan" tagId={null} draftMinutes={30} />
      <EstimationFeedforward destination="plan" tagId="tag-life" draftMinutes={30} />
    </div>
  ),
};
