'use client';

import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { IconPicker } from './IconPicker';
import { TagIcon } from './TagIcon';

/**
 * IconPicker — タグ用アイコン選択コンポーネント
 *
 * キュレート済みLucideアイコンをカテゴリ別グリッドで表示。
 * 「アイコンなし」を選択すると従来の色ドットにフォールバック。
 */
const meta = {
  title: 'Product/Features/Tags/IconPicker',
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

/** デフォルト: アイコン未選択。「アイコンなし」が選択状態。 */
export const Default: Story = {
  render: function DefaultStory() {
    const [icon, setIcon] = useState<string | null>(null);

    return (
      <div className="max-w-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-muted-foreground text-sm">選択中:</span>
          <TagIcon icon={icon} color="blue" size="md" />
          <span className="text-foreground text-sm">{icon ?? 'なし'}</span>
        </div>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
    );
  },
};

/** アイコン選択済み: briefcase が選択された状態。 */
export const WithSelection: Story = {
  render: function WithSelectionStory() {
    const [icon, setIcon] = useState<string | null>('briefcase');

    return (
      <div className="max-w-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-muted-foreground text-sm">選択中:</span>
          <TagIcon icon={icon} color="green" size="md" />
          <span className="text-foreground text-sm">{icon ?? 'なし'}</span>
        </div>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
    );
  },
};
