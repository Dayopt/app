import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { TagColorEntry } from '@/lib/tag-colors';

import { TagRow } from './TagRow';

/**
 * TagRow — タグ表示・選択行
 *
 * カラードット + タグ名を表示し、クリックで TagQuickSelector を開く。
 * タグ未設定時は「タグを追加」を表示。右側にオプションで削除ボタンを配置。
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

/** タグ未設定状態。「タグを追加」が表示される。 */
export const NoTag: Story = {
  render: () => (
    <div className="w-72">
      <TagRow tagId={null} onTagChange={fn()} onCreateAndSelect={fn()} />
    </div>
  ),
};

/** タグ設定済み（青）。カラードット + タグ名が表示される。 */
export const WithBlueTag: Story = {
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

/** タグ設定済み（赤）。 */
export const WithRedTag: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-red-id"
        tagName="プライベート"
        tagColorClasses={redTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
      />
    </div>
  ),
};

/** タグ設定済み（緑）。 */
export const WithGreenTag: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-green-id"
        tagName="運動"
        tagColorClasses={greenTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
      />
    </div>
  ),
};

/** 削除ボタンあり（タグ設定済み）。 */
export const WithDeleteButton: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-blue-id"
        tagName="仕事"
        tagColorClasses={blueTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
        onDelete={fn()}
      />
    </div>
  ),
};

/** 削除ボタンあり（タグ未設定）。 */
export const NoTagWithDeleteButton: Story = {
  render: () => (
    <div className="w-72">
      <TagRow tagId={null} onTagChange={fn()} onCreateAndSelect={fn()} onDelete={fn()} />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">NoTag（未設定）</p>
        <TagRow tagId={null} onTagChange={fn()} onCreateAndSelect={fn()} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">WithTag（タグあり・青）</p>
        <TagRow
          tagId="tag-1"
          tagName="仕事"
          tagColorClasses={blueTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">WithTag（タグあり・赤）</p>
        <TagRow
          tagId="tag-2"
          tagName="プライベート"
          tagColorClasses={redTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">
          WithDeleteButton（削除ボタンあり）
        </p>
        <TagRow
          tagId="tag-1"
          tagName="仕事"
          tagColorClasses={blueTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
          onDelete={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">NoTag + DeleteButton</p>
        <TagRow tagId={null} onTagChange={fn()} onCreateAndSelect={fn()} onDelete={fn()} />
      </div>
    </div>
  ),
};
