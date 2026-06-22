import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { Button, Spinner } from '@dayopt/components';

const meta = {
  title: 'Components/UI/Spinner',
  component: Spinner,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'default', 'lg', 'xl'],
      description: 'サイズプリセット（sm=16px, default=24px, lg=32px, xl=48px）',
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPatterns: Story = {
  render: function SpinnerStory() {
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = () => {
      setIsLoading(true);
      setTimeout(() => setIsLoading(false), 2000);
    };

    return (
      <div className="flex flex-col items-start gap-6">
        <div className="flex gap-4">
          <Button onClick={handleClick} loading={isLoading}>
            ログイン
          </Button>
          <Button onClick={handleClick} loading={isLoading} loadingText="送信中...">
            送信
          </Button>
        </div>

        <Spinner />

        <div className="flex items-end gap-6">
          {(['sm', 'default', 'lg', 'xl'] as const).map((size) => (
            <Spinner key={size} size={size} />
          ))}
        </div>
      </div>
    );
  },
};
