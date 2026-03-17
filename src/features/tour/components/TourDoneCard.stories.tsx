import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TourDoneCard } from './TourDoneCard';

/** TourDoneCard — ツアー完了時の中央ダイアログ */
const meta = {
  title: 'Features/Tour/TourDoneCard',
  component: TourDoneCard,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onDone: fn(),
  },
} satisfies Meta<typeof TourDoneCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト表示（フルスクリーンオーバーレイ） */
export const Default: Story = {};
