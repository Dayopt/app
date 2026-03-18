import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';

import type { FulfillmentScore } from '../../../types/entry';

import { FulfillmentRow } from './FulfillmentRow';

/**
 * FulfillmentRow — 充実度インライン行
 *
 * 3段階（低/中/高）のトグルボタン。aria-label + aria-pressed 対応。
 */
const meta = {
  title: 'Features/Entry/Inspector/FulfillmentRow',
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

function FulfillmentRowDemo({
  initialScore = null,
  disabled = false,
}: {
  initialScore?: FulfillmentScore | null;
  disabled?: boolean;
}) {
  const [score, setScore] = useState<FulfillmentScore | null>(initialScore);
  return (
    <div className="w-64">
      <FulfillmentRow
        label="充実度"
        score={score}
        onScoreChange={setScore}
        disabled={disabled}
        scoreLabels={{
          low: '充実度: 低',
          medium: '充実度: 中',
          high: '充実度: 高',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 未選択状態。3つのボタンが均等に並ぶ。 */
export const Default: Story = {
  render: () => <FulfillmentRowDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    // aria-label が設定されている
    expect(buttons[0]).toHaveAttribute('aria-label', '充実度: 低');
    expect(buttons[1]).toHaveAttribute('aria-label', '充実度: 中');
    expect(buttons[2]).toHaveAttribute('aria-label', '充実度: 高');
    // 未選択なので全て aria-pressed=false
    for (const btn of buttons) {
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    }
  },
};

/** 低を選択した状態。 */
export const SelectedLow: Story = {
  render: () => <FulfillmentRowDemo initialScore={1} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'false');
  },
};

/** 中を選択した状態。 */
export const SelectedMedium: Story = {
  render: () => <FulfillmentRowDemo initialScore={2} />,
};

/** 高を選択した状態。 */
export const SelectedHigh: Story = {
  render: () => <FulfillmentRowDemo initialScore={3} />,
};

/** 無効化状態。操作不可。 */
export const Disabled: Story = {
  render: () => <FulfillmentRowDemo initialScore={2} disabled />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  },
};

/** 全状態を一覧表示。 */
export const AllStates: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <p className="text-muted-foreground text-xs">未選択</p>
      <FulfillmentRowDemo />
      <p className="text-muted-foreground text-xs">低 (score=1)</p>
      <FulfillmentRowDemo initialScore={1} />
      <p className="text-muted-foreground text-xs">中 (score=2)</p>
      <FulfillmentRowDemo initialScore={2} />
      <p className="text-muted-foreground text-xs">高 (score=3)</p>
      <FulfillmentRowDemo initialScore={3} />
      <p className="text-muted-foreground text-xs">無効化 (score=2)</p>
      <FulfillmentRowDemo initialScore={2} disabled />
    </div>
  ),
};
