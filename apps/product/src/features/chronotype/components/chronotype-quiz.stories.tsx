import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ChronotypeQuiz } from './chronotype-quiz';

/** ChronotypeQuiz — クロノタイプ診断クイズ（6問 + 結果サマリー） */
const meta = {
  title: 'Features/Chronotype/Quiz',
  component: ChronotypeQuiz,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onComplete: fn(),
    onCancel: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChronotypeQuiz>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 初期状態（Q1表示） */
export const Default: Story = {};
