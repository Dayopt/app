import { useState } from 'react';

import { ReportGranularitySwitcher } from './ReportGranularitySwitcher';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReportGranularity } from '../../lib/report-period';

/**
 * 週｜月｜年 の粒度切替（デスクトップのヘッダー専用）。
 *
 * 選択肢が 3 つで固定なのでセグメントで出す（1 タップで切り替わる）。モバイルには
 * 置かない — 狭い面では期間ラベルと `‹ ›` が潰れるため（仕様 §8）。
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

/** 実際に切り替わるところ。選択は 1 タップで、確定操作を挟まない。 */
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
