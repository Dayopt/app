import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { Textarea } from './textarea';

/** Textarea - 複数行テキスト入力。改行や長文が必要な場面で使用、単一行はInputを使用。 */
const meta = {
  title: 'Components/UI/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'メモを入力...',
    className: 'w-80',
    'aria-label': 'Memo',
  },
};

export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    const MAX_LENGTH = 200;
    const [value, setValue] = useState('');

    return (
      <div className="flex flex-col items-start gap-6">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="メモを入力..."
          maxLength={MAX_LENGTH}
          className="min-h-[80px] w-80 resize-none"
          aria-label="Memo with counter"
        />

        <div className="w-80 space-y-4">
          <Textarea
            placeholder="通常"
            className="min-h-[80px] resize-none"
            aria-label="Normal textarea"
          />
          <Textarea
            placeholder="無効"
            disabled
            className="min-h-[80px] resize-none"
            aria-label="Disabled textarea"
          />
          <Textarea
            placeholder="エラー状態"
            aria-invalid="true"
            className="min-h-[80px] resize-none"
            aria-label="Error textarea"
          />
        </div>
      </div>
    );
  },
};
