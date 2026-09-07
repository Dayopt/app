import { useState } from 'react';

import { ReportGranularitySwitcher } from './ReportGranularitySwitcher';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReportGranularity } from '../../lib/report-period';

/**
 * 週｜月｜年 の粒度切替（デスクトップのヘッダー専用）。
 *
 * カレンダーのビュー切替（`ViewSwitcher`）と同じ作り: `h-8` の outline トリガー +
 * シェブロン + `DropdownMenu`。ヘッダーの 32px 行に収まる高さに揃えてある。
 * モバイルには置かない — 狭い面では期間ラベルと `‹ ›` が潰れるため（仕様 §8）。
 */
const meta = {
  title: 'Product/Features/Review/Layout/ReportGranularitySwitcher',
  component: ReportGranularitySwitcher,
  parameters: { layout: 'centered' },
  argTypes: {
    value: { control: 'radio', options: ['week', 'month', 'year'] },
  },
  args: { value: 'week', onValueChange: () => {} },
} satisfies Meta<typeof ReportGranularitySwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Week: Story = {};

export const Month: Story = { args: { value: 'month' } };

export const Year: Story = { args: { value: 'year' } };

/** 実際に切り替わるところ。メニューから選ぶと即座に反映され、確定操作を挟まない。 */
export const Interactive: Story = {
  render: function InteractiveSwitcher() {
    const [value, setValue] = useState<ReportGranularity>('week');
    return <ReportGranularitySwitcher value={value} onValueChange={setValue} />;
  },
};

/** すべての状態を 1 画面に並べる（ADR-023 の AllPatterns）。 */
export const AllPatterns: Story = {
  render: function AllPatternsGranularitySwitcher() {
    return (
      <div className="flex flex-col gap-6">
        <Row label="週を選択中">
          <ReportGranularitySwitcher value="week" onValueChange={() => {}} />
        </Row>
        <Row label="月を選択中">
          <ReportGranularitySwitcher value="month" onValueChange={() => {}} />
        </Row>
        <Row label="年を選択中">
          <ReportGranularitySwitcher value="year" onValueChange={() => {}} />
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
