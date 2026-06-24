import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TAG_COLOR_NAMES } from '../lib/tag-colors';

import { TagIcon } from './TagIcon';

/**
 * TagIcon — タグアイコン/色ドット表示コンポーネント
 *
 * icon が設定されていれば Lucide アイコンをタグ色で着色表示。
 * 未設定（null）なら従来の色ドットにフォールバック。
 */
const meta = {
  title: 'Product/Features/Tags/TagIcon',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** アイコンあり: Lucideアイコンがタグ色で着色される */
export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <TagIcon icon="briefcase" color="blue" size="sm" />
      <TagIcon icon="briefcase" color="blue" size="md" />
      <TagIcon icon="briefcase" color="blue" size="lg" />
    </div>
  ),
};

/** アイコンなし: 従来の色ドットにフォールバック */
export const WithoutIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <TagIcon icon={null} color="blue" size="sm" />
      <TagIcon icon={null} color="blue" size="md" />
      <TagIcon icon={null} color="blue" size="lg" />
    </div>
  ),
};

/** 各色 × アイコン: 全10色でアイコン表示 */
export const AllColorsWithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {TAG_COLOR_NAMES.map((color) => (
        <div key={color} className="flex flex-col items-center gap-1">
          <TagIcon icon="briefcase" color={color} size="md" />
          <span className="text-muted-foreground text-xs">{color}</span>
        </div>
      ))}
    </div>
  ),
};

/** 各色 × ドット: 全10色でドット表示 */
export const AllColorsDot: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {TAG_COLOR_NAMES.map((color) => (
        <div key={color} className="flex flex-col items-center gap-1">
          <TagIcon icon={null} color={color} size="md" />
          <span className="text-muted-foreground text-xs">{color}</span>
        </div>
      ))}
    </div>
  ),
};
