import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';

import type { Fulfillment } from '../../../schemas/timeblock';
import { RecordFulfillmentRow } from './RecordFulfillmentRow';

/**
 * RecordFulfillmentRow — 記録の充実度インライン行（#2317）
 *
 * 3段階（消耗/普通/充実）のトグルボタン。aria-label + aria-pressed 対応。
 * Record 専用（Plan には無い概念）。
 */
const meta = {
  title: 'Product/Features/Timeblock/Inspector/RecordFulfillmentRow',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function RecordFulfillmentRowDemo({
  initialValue = null,
  disabled = false,
}: {
  initialValue?: Fulfillment | null;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<Fulfillment | null>(initialValue);
  return (
    <div className="w-64">
      <RecordFulfillmentRow value={value} onChange={setValue} disabled={disabled} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 未入力状態（既定）。3つのボタンが均等に並ぶ。 */
export const Default: Story = {
  render: () => <RecordFulfillmentRowDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    for (const btn of buttons) {
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    }
  },
};

/** 消耗を選択した状態。 */
export const SelectedLow: Story = {
  render: () => <RecordFulfillmentRowDemo initialValue="low" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'false');
  },
};

/** 普通を選択した状態。 */
export const SelectedMedium: Story = {
  render: () => <RecordFulfillmentRowDemo initialValue="medium" />,
};

/** 充実を選択した状態。 */
export const SelectedHigh: Story = {
  render: () => <RecordFulfillmentRowDemo initialValue="high" />,
};

/** 無効化状態。操作不可。 */
export const Disabled: Story = {
  render: () => <RecordFulfillmentRowDemo initialValue="medium" disabled />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  },
};

/** 全状態を一覧表示。 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <p className="text-muted-foreground text-xs">未入力（既定）</p>
      <RecordFulfillmentRowDemo />
      <p className="text-muted-foreground text-xs">消耗</p>
      <RecordFulfillmentRowDemo initialValue="low" />
      <p className="text-muted-foreground text-xs">普通</p>
      <RecordFulfillmentRowDemo initialValue="medium" />
      <p className="text-muted-foreground text-xs">充実</p>
      <RecordFulfillmentRowDemo initialValue="high" />
      <p className="text-muted-foreground text-xs">無効化</p>
      <RecordFulfillmentRowDemo initialValue="medium" disabled />
    </div>
  ),
};
