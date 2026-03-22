import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { ReminderToggle } from './ReminderToggle';

const meta = {
  title: 'Features/Entry/Inspector/ReminderToggle',
  component: ReminderToggle,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ReminderToggle>;

export default meta;

function ReminderToggleDemo({
  variant,
  initial = null,
}: {
  variant: 'inspector' | 'compact' | 'button' | 'icon';
  initial?: number | null;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return <ReminderToggle value={value} onChange={setValue} variant={variant} />;
}

/** Inspector variant（デフォルト）— Switch表示 */
export const Inspector: StoryObj = {
  render: () => <ReminderToggleDemo variant="inspector" />,
};

/** Button variant */
export const ButtonVariant: StoryObj = {
  render: () => <ReminderToggleDemo variant="button" />,
};

/** Icon variant */
export const Icon: StoryObj = {
  render: () => <ReminderToggleDemo variant="icon" />,
};

/** Compact variant */
export const Compact: StoryObj = {
  render: () => <ReminderToggleDemo variant="compact" />,
};

/** ON状態 */
export const EnabledState: StoryObj = {
  render: () => <ReminderToggleDemo variant="icon" initial={0} />,
};

/** 無効化状態 */
export const Disabled: StoryObj = {
  render: () => <ReminderToggle value={null} onChange={() => undefined} disabled />,
};

/** 全バリアント一覧 */
export const AllPatterns: StoryObj = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      {(['inspector', 'button', 'icon', 'compact'] as const).map((variant) => (
        <div key={variant} className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium">{variant}</p>
          <ReminderToggleDemo variant={variant} />
        </div>
      ))}
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">disabled</p>
        <ReminderToggle value={null} onChange={() => undefined} disabled />
      </div>
    </div>
  ),
};
