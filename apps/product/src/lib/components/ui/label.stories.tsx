import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Checkbox } from './checkbox';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'Components/UI/Label',
  component: Label,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'メールアドレス',
    htmlFor: 'email',
  },
};

export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    return (
      <div className="flex flex-col items-start gap-6">
        <div className="space-y-2">
          <Label htmlFor="display-name">表示名</Label>
          <Input id="display-name" type="text" placeholder="田中太郎" />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="agree" />
          <Label htmlFor="agree">利用規約に同意する</Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="disabled-check" disabled />
          <Label htmlFor="disabled-check">無効なチェックボックス</Label>
        </div>
      </div>
    );
  },
};
