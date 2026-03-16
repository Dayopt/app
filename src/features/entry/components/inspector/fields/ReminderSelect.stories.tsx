import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { ReminderSelect } from './ReminderSelect';

const meta = {
  title: 'Features/Entry/Inspector/ReminderSelect',
  component: ReminderSelect,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ReminderSelect>;

export default meta;

function ReminderSelectDemo({ variant }: { variant: 'inspector' | 'compact' | 'button' | 'icon' }) {
  const [value, setValue] = useState<number | null>(null);
  return <ReminderSelect value={value} onChange={setValue} variant={variant} />;
}

/** Inspector variant（デフォルト）。 */
export const Inspector: StoryObj = {
  render: () => <ReminderSelectDemo variant="inspector" />,
};

/** Button variant。 */
export const ButtonVariant: StoryObj = {
  render: () => <ReminderSelectDemo variant="button" />,
};

/** Icon variant。 */
export const Icon: StoryObj = {
  render: () => <ReminderSelectDemo variant="icon" />,
};

/** Compact variant。 */
export const Compact: StoryObj = {
  render: () => <ReminderSelectDemo variant="compact" />,
};

/** 全バリアント一覧。 */
export const AllPatterns: StoryObj = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      {(['inspector', 'button', 'icon', 'compact'] as const).map((variant) => (
        <div key={variant} className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium">{variant}</p>
          <ReminderSelectDemo variant={variant} />
        </div>
      ))}
    </div>
  ),
};
