import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TagQuickSelector } from './TagQuickSelector';

/** TagQuickSelector — タグ選択フローティングパネル */
const meta = {
  title: 'Features/Tags/TagQuickSelector',
  component: TagQuickSelector,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    onSelect: fn(),
    onCreateAndSelect: fn(),
  },
} satisfies Meta<typeof TagQuickSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * タグゼロ状態（新規ユーザー）
 *
 * サンプルタグ候補チップ（仕事/勉強/運動/休憩/食事）が表示される。
 * 検索バーは非表示。
 */
export const EmptyState: Story = {};

/** パネル表示 */
export const Default: Story = {};
