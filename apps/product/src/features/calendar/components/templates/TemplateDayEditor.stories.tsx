import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TemplateDayEditor } from './TemplateDayEditor';
import type { TemplateBlockMock } from './types';

const blocks: TemplateBlockMock[] = [
  {
    id: 'b1',
    activityName: '集中作業',
    categoryColor: 'blue',
    categoryIcon: 'briefcase',
    anchorRatio: 0.1,
    medianDurationRatio: 0.3,
  },
  {
    id: 'b2',
    activityName: 'ランニング',
    categoryColor: 'teal',
    categoryIcon: 'footprints',
    anchorRatio: 0.45,
    medianDurationRatio: 0.15,
  },
];

/**
 * 「型を一日として開く」編集ビュー（v1.0 §5.4）。専用エディタは持たず、
 * いつもの日ビュー操作 + 上書き保存時の差分一行で足りる、という骨格を示す。
 */
const meta = {
  title: 'Product/Features/Calendar/Templates/TemplateDayEditor',
  component: TemplateDayEditor,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { templateName: '朝のルーティン', blocks },
} satisfies Meta<typeof TemplateDayEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 開いた直後（未保存、差分なし）。 */
export const JustOpened: Story = {};

/** 編集して上書き保存した直後（差分一行が出る）。 */
export const SavedWithDiff: Story = {
  args: {
    savedDiffSummary: 'ランニングの錨位置を30分後ろへ',
  },
};

export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">開いた直後</p>
        <TemplateDayEditor templateName="朝のルーティン" blocks={blocks} />
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">上書き保存後（差分一行）</p>
        <TemplateDayEditor
          templateName="朝のルーティン"
          blocks={blocks}
          savedDiffSummary="ランニングの錨位置を30分後ろへ"
        />
      </div>
    </div>
  ),
};
