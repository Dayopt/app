import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TourPreChoice } from './TourPreChoice';

/** TourPreChoice — ツアー開始前の選択画面 */
const meta = {
  title: 'Features/Tour/TourPreChoice',
  component: TourPreChoice,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onStart: fn(),
    onSkip: fn(),
  },
} satisfies Meta<typeof TourPreChoice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト表示 */
export const Default: Story = {};
