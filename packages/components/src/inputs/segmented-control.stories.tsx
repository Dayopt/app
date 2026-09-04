import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { SegmentedControl } from '@dayopt/components';

/** SegmentedControl - 少数の排他的な選択肢を横並びで切り替える。2〜4 個が目安で、それ以上は DropdownMenu を使う。 */
const meta = {
  title: 'Shared/Components/Inputs/SegmentedControl',
  component: SegmentedControl,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    size: {
      control: 'radio',
      options: ['sm', 'md'],
      description: 'ボタンの余白と文字サイズ。高さ（44px）は変わらない',
    },
    ariaLabel: {
      control: 'text',
      description: 'グループ自体のラベル。何を切り替えるのかを読み上げる',
    },
  },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

const GRANULARITY_OPTIONS = [
  { value: 'week', label: '週' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
] as const;

export const Default: Story = {
  args: {
    value: 'week',
    onValueChange: () => {},
    options: GRANULARITY_OPTIONS,
    ariaLabel: '期間の粒度',
  },
  render: function DefaultSegmentedControl(args) {
    const [value, setValue] = useState<string>('week');
    return (
      <SegmentedControl
        {...args}
        value={value}
        onValueChange={setValue}
        options={GRANULARITY_OPTIONS}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const week = canvas.getByRole('button', { name: '週' });
    const month = canvas.getByRole('button', { name: '月' });

    await expect(week).toHaveAttribute('aria-pressed', 'true');
    await expect(month).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(month);

    await expect(month).toHaveAttribute('aria-pressed', 'true');
    await expect(week).toHaveAttribute('aria-pressed', 'false');
  },
};

export const TwoOptions: Story = {
  args: {
    value: 'plan',
    onValueChange: () => {},
    options: [
      { value: 'plan', label: '予定' },
      { value: 'record', label: '記録' },
    ],
    ariaLabel: '表示するレーン',
  },
  render: function TwoOptionSegmentedControl(args) {
    const [value, setValue] = useState<string>('plan');
    return <SegmentedControl {...args} value={value} onValueChange={setValue} />;
  },
};

export const WithDisabledOption: Story = {
  args: {
    value: 'week',
    onValueChange: () => {},
    options: [
      { value: 'week', label: '週' },
      { value: 'month', label: '月', disabled: true },
      { value: 'year', label: '年', disabled: true },
    ],
    ariaLabel: '期間の粒度',
  },
  render: function DisabledSegmentedControl(args) {
    const [value, setValue] = useState<string>('week');
    return <SegmentedControl {...args} value={value} onValueChange={setValue} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const month = canvas.getByRole('button', { name: '月' });
    await expect(month).toBeDisabled();

    // 押しても選択が移らない
    await userEvent.click(month, { pointerEventsCheck: 0 });
    await expect(canvas.getByRole('button', { name: '週' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

/** すべての variant と state を 1 画面に並べる（ADR-023 の AllPatterns）。 */
export const AllPatterns: Story = {
  args: {
    value: 'week',
    onValueChange: () => {},
    options: GRANULARITY_OPTIONS,
    ariaLabel: '期間の粒度',
  },
  parameters: { layout: 'padded' },
  render: function AllPatternsSegmentedControl() {
    return (
      <div className="flex flex-col gap-6">
        <Row label="size: md（既定）">
          <SegmentedControl
            value="week"
            onValueChange={() => {}}
            options={GRANULARITY_OPTIONS}
            ariaLabel="期間の粒度"
          />
        </Row>

        <Row label="size: sm">
          <SegmentedControl
            value="month"
            onValueChange={() => {}}
            options={GRANULARITY_OPTIONS}
            ariaLabel="期間の粒度"
            size="sm"
          />
        </Row>

        <Row label="選択肢 2 個">
          <SegmentedControl
            value="record"
            onValueChange={() => {}}
            options={[
              { value: 'plan', label: '予定' },
              { value: 'record', label: '記録' },
            ]}
            ariaLabel="表示するレーン"
          />
        </Row>

        <Row label="選択肢 4 個（上限の目安）">
          <SegmentedControl
            value="all"
            onValueChange={() => {}}
            options={[
              { value: 'all', label: 'すべて' },
              { value: 'day', label: '日' },
              { value: 'week', label: '週' },
              { value: 'month', label: '月' },
            ]}
            ariaLabel="表示範囲"
          />
        </Row>

        <Row label="一部 disabled（Pro 限定などの出し分け）">
          <SegmentedControl
            value="week"
            onValueChange={() => {}}
            options={[
              { value: 'week', label: '週' },
              { value: 'month', label: '月', disabled: true },
              { value: 'year', label: '年', disabled: true },
            ]}
            ariaLabel="期間の粒度"
          />
        </Row>

        <Row label="長いラベル">
          <SegmentedControl
            value="fulfilling"
            onValueChange={() => {}}
            options={[
              { value: 'fulfilling', label: '充実していた' },
              { value: 'draining', label: '消耗した' },
            ]}
            ariaLabel="充実の度合い"
          />
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
