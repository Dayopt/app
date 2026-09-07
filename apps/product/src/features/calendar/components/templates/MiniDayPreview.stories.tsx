import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MiniDayPreview } from './MiniDayPreview';
import type { TemplateBlockView } from './types';

/**
 * テンプレートのホバープレビュー用ミニチュア日ビュー（v1.0 §5.4）。
 * 時刻ラベルなし・相対長のみで、組成・順序・錨位置だけを表現する。
 */
const meta = {
  title: 'Product/Features/Calendar/Templates/MiniDayPreview',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-80 w-48">
      <>{children}</>
    </div>
  );
}

function makeBlock(overrides: Partial<TemplateBlockView> = {}): TemplateBlockView {
  return {
    id: 'block-1',
    activityName: '集中作業',
    categoryColor: 'blue',
    categoryIcon: 'briefcase',
    anchorRatio: 0.1,
    medianDurationRatio: 0.2,
    ...overrides,
  };
}

/** 朝型の並び: 集中作業 → 運動 → 学び。 */
export const MorningRoutine: Story = {
  render: () => (
    <Frame>
      <MiniDayPreview
        blocks={[
          makeBlock({
            id: 'b1',
            activityName: '集中作業',
            categoryColor: 'blue',
            anchorRatio: 0.05,
            medianDurationRatio: 0.25,
          }),
          makeBlock({
            id: 'b2',
            activityName: 'ランニング',
            categoryColor: 'teal',
            categoryIcon: 'footprints',
            anchorRatio: 0.35,
            medianDurationRatio: 0.1,
          }),
          makeBlock({
            id: 'b3',
            activityName: '読書',
            categoryColor: 'violet',
            categoryIcon: 'book-open',
            anchorRatio: 0.5,
            medianDurationRatio: 0.15,
          }),
        ]}
      />
    </Frame>
  ),
};

/** 未分類のブロックを含む並び（色ドット + 中立アイコンにフォールバック）。 */
export const WithUncategorized: Story = {
  render: () => (
    <Frame>
      <MiniDayPreview
        blocks={[
          makeBlock({ id: 'b1', categoryColor: 'blue' }),
          makeBlock({
            id: 'b2',
            activityName: '未分類の作業',
            categoryColor: null,
            categoryIcon: null,
            anchorRatio: 0.3,
            medianDurationRatio: 0.12,
          }),
        ]}
      />
    </Frame>
  ),
};

/** ブロックが密集し、狭いブロックはアイコン/名前を省略する。 */
export const DenseSchedule: Story = {
  render: () => (
    <Frame>
      <MiniDayPreview
        blocks={[
          makeBlock({
            id: 'b1',
            activityName: 'スタンドアップ',
            categoryColor: 'amber',
            anchorRatio: 0,
            medianDurationRatio: 0.03,
          }),
          makeBlock({
            id: 'b2',
            activityName: 'MTG',
            categoryColor: 'indigo',
            anchorRatio: 0.05,
            medianDurationRatio: 0.03,
          }),
          makeBlock({
            id: 'b3',
            activityName: '集中作業',
            categoryColor: 'blue',
            anchorRatio: 0.1,
            medianDurationRatio: 0.3,
          }),
          makeBlock({
            id: 'b4',
            activityName: '昼食',
            categoryColor: 'green',
            anchorRatio: 0.45,
            medianDurationRatio: 0.08,
          }),
        ]}
      />
    </Frame>
  ),
};

/** 空のテンプレート（本来は起こり得ないが、防御的に確認する）。 */
export const Empty: Story = {
  render: () => (
    <Frame>
      <MiniDayPreview blocks={[]} />
    </Frame>
  ),
};

export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">朝型の並び</p>
        <Frame>
          <MiniDayPreview
            blocks={[
              makeBlock({
                id: 'b1',
                activityName: '集中作業',
                categoryColor: 'blue',
                anchorRatio: 0.05,
                medianDurationRatio: 0.25,
              }),
              makeBlock({
                id: 'b2',
                activityName: 'ランニング',
                categoryColor: 'teal',
                categoryIcon: 'footprints',
                anchorRatio: 0.35,
                medianDurationRatio: 0.1,
              }),
              makeBlock({
                id: 'b3',
                activityName: '読書',
                categoryColor: 'violet',
                categoryIcon: 'book-open',
                anchorRatio: 0.5,
                medianDurationRatio: 0.15,
              }),
            ]}
          />
        </Frame>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">未分類を含む</p>
        <Frame>
          <MiniDayPreview
            blocks={[
              makeBlock({ id: 'b1', categoryColor: 'blue' }),
              makeBlock({
                id: 'b2',
                activityName: '未分類の作業',
                categoryColor: null,
                categoryIcon: null,
                anchorRatio: 0.3,
                medianDurationRatio: 0.12,
              }),
            ]}
          />
        </Frame>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">密なスケジュール</p>
        <Frame>
          <MiniDayPreview
            blocks={[
              makeBlock({
                id: 'b1',
                activityName: 'スタンドアップ',
                categoryColor: 'amber',
                anchorRatio: 0,
                medianDurationRatio: 0.03,
              }),
              makeBlock({
                id: 'b2',
                activityName: 'MTG',
                categoryColor: 'indigo',
                anchorRatio: 0.05,
                medianDurationRatio: 0.03,
              }),
              makeBlock({
                id: 'b3',
                activityName: '集中作業',
                categoryColor: 'blue',
                anchorRatio: 0.1,
                medianDurationRatio: 0.3,
              }),
              makeBlock({
                id: 'b4',
                activityName: '昼食',
                categoryColor: 'green',
                anchorRatio: 0.45,
                medianDurationRatio: 0.08,
              }),
            ]}
          />
        </Frame>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">空</p>
        <Frame>
          <MiniDayPreview blocks={[]} />
        </Frame>
      </div>
    </div>
  ),
};
