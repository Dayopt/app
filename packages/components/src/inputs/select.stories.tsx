import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dayopt/components';

/** Select - ドロップダウン選択。5個以上の選択肢に適切、2-4個はRadioGroupを使用。 */
const meta = {
  title: 'Shared/Components/Inputs/Select',
  component: Select,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function DefaultSelect() {
    const [value, setValue] = useState('daily');
    return (
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="h-8 w-24" aria-label="Period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">日</SelectItem>
          <SelectItem value="weekly">週</SelectItem>
          <SelectItem value="monthly">月</SelectItem>
        </SelectContent>
      </Select>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // セレクトトリガーをクリックしてドロップダウンを開く
    const trigger = canvas.getByRole('combobox');
    await userEvent.click(trigger);

    // ドロップダウンの選択肢を確認（ポータル経由）
    const body = within(document.body);
    await expect(body.getByText('週')).toBeInTheDocument();

    // 「週」を選択
    await userEvent.click(body.getByText('週'));
  },
};

export const PeriodSelector: Story = {
  render: function PeriodSelect() {
    const [periodType, setPeriodType] = useState('daily');
    const [comparePeriod, setComparePeriod] = useState('previous');

    const periodOptions = [
      { value: 'daily', label: '日' },
      { value: 'weekly', label: '週' },
      { value: 'monthly', label: '月' },
    ];

    const compareOptions = [
      { value: 'previous', label: '前の期間' },
      { value: 'lastYear', label: '前年同期' },
      { value: 'none', label: '比較なし' },
    ];

    return (
      <div className="flex items-center gap-2">
        <Select value={periodType} onValueChange={setPeriodType}>
          <SelectTrigger className="h-8 w-24" aria-label="Period type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={comparePeriod} onValueChange={setComparePeriod}>
          <SelectTrigger className="h-8 w-28" aria-label="Compare period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {compareOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  },
};

/**
 * ghostバリアント - 背景なし、ホバー時のみ背景が出現。
 * ツールバーやヘッダー内など、境界線なしで溶け込ませたい場合に使用。
 */
export const GhostVariant: Story = {
  render: function GhostVariantStory() {
    const [value, setValue] = useState('daily');

    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-muted-foreground text-xs">ghost（背景なし）</p>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger variant="ghost" className="h-8 w-24" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">日</SelectItem>
            <SelectItem value="weekly">週</SelectItem>
            <SelectItem value="monthly">月</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  },
};

export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    const [value1, setValue1] = useState('daily');
    const [value2, setValue2] = useState('daily');

    return (
      <div className="flex flex-col items-start gap-6">
        <p className="text-muted-foreground text-xs">default（ボーダー付き）</p>
        <Select value={value1} onValueChange={setValue1}>
          <SelectTrigger className="h-8 w-24" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">日</SelectItem>
            <SelectItem value="weekly">週</SelectItem>
            <SelectItem value="monthly">月</SelectItem>
          </SelectContent>
        </Select>

        <p className="text-muted-foreground text-xs">ghost（背景なし）</p>
        <Select value={value2} onValueChange={setValue2}>
          <SelectTrigger variant="ghost" className="h-8 w-24" aria-label="Period ghost">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">日</SelectItem>
            <SelectItem value="weekly">週</SelectItem>
            <SelectItem value="monthly">月</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  },
};
