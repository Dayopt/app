import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { TagColorEntry } from '@/lib/tag-colors';

import { TagRow } from './TagRow';

/**
 * TagRow — タグ表示・選択行
 *
 * カラードット + タグ名を表示し、クリックで TagQuickSelector を開く。
 * タグ未設定時は「タグを追加」を表示。
 * 右側に「…」メニュー（パレット登録/解除・統計・削除）を配置。
 */
const meta = {
  title: 'Features/Entry/Inspector/TagRow',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

const blueTag: TagColorEntry = {
  dot: 'bg-tag-blue',
  border: 'border-tag-blue',
  tint: 'bg-tag-blue-tint',
  cssVar: 'var(--tag-blue)',
  cssVarTint: 'var(--tag-blue-tint)',
};

const redTag: TagColorEntry = {
  dot: 'bg-tag-red',
  border: 'border-tag-red',
  tint: 'bg-tag-red-tint',
  cssVar: 'var(--tag-red)',
  cssVarTint: 'var(--tag-red-tint)',
};

const greenTag: TagColorEntry = {
  dot: 'bg-tag-green',
  border: 'border-tag-green',
  tint: 'bg-tag-green-tint',
  cssVar: 'var(--tag-green)',
  cssVarTint: 'var(--tag-green-tint)',
};

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** タグ設定済み（青）+ …メニュー（パレット追加・統計・削除）。 */
export const WithMenu: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-blue-id"
        tagName="仕事"
        tagColorClasses={blueTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
        onPinToPalette={fn()}
        isPinnedInPalette={false}
        onViewStats={fn()}
        onDelete={fn()}
      />
    </div>
  ),
};

/** パレット登録済み → …メニューに「パレットから解除」が表示される。 */
export const PinnedInPalette: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-blue-id"
        tagName="仕事"
        tagColorClasses={blueTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
        onPinToPalette={fn()}
        onUnpinFromPalette={fn()}
        isPinnedInPalette={true}
        onViewStats={fn()}
        onDelete={fn()}
      />
    </div>
  ),
};

/** コロン記法タグ。›セパレーター表示される。 */
export const ColonTag: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-red-id"
        tagName="開発:API"
        tagColorClasses={redTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
        onViewStats={fn()}
        onDelete={fn()}
      />
    </div>
  ),
};

/** 削除のみ（パレット・統計なし）。 */
export const DeleteOnly: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-green-id"
        tagName="運動"
        tagColorClasses={greenTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
        onDelete={fn()}
      />
    </div>
  ),
};

/** メニューなし（タグのみ）。 */
export const NoMenu: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-blue-id"
        tagName="仕事"
        tagColorClasses={blueTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
      />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">フルメニュー（未登録）</p>
        <TagRow
          tagId="tag-1"
          tagName="仕事"
          tagColorClasses={blueTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
          onPinToPalette={fn()}
          isPinnedInPalette={false}
          onViewStats={fn()}
          onDelete={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">フルメニュー（パレット登録済み）</p>
        <TagRow
          tagId="tag-2"
          tagName="プライベート"
          tagColorClasses={redTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
          onPinToPalette={fn()}
          onUnpinFromPalette={fn()}
          isPinnedInPalette={true}
          onViewStats={fn()}
          onDelete={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">コロン記法タグ</p>
        <TagRow
          tagId="tag-3"
          tagName="開発:API"
          tagColorClasses={greenTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
          onViewStats={fn()}
          onDelete={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">削除のみ</p>
        <TagRow
          tagId="tag-4"
          tagName="運動"
          tagColorClasses={greenTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
          onDelete={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">メニューなし</p>
        <TagRow
          tagId="tag-5"
          tagName="読書"
          tagColorClasses={blueTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
        />
      </div>
    </div>
  ),
};
