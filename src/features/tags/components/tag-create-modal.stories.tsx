import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button } from '@/components/ui/button';

import type { Tag } from '../types';
import { TagCreateModal } from './tag-create-modal';

/** TagCreateModal - タグ作成モーダル */
const meta = {
  title: 'Features/Tags/CreateModal',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs', 'critical'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const EXISTING_TAGS: Tag[] = [
  {
    id: 'tag-1',
    name: '仕事',
    user_id: 'user-1',
    color: 'blue',
    icon: 'briefcase',
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-2',
    name: '仕事:会議',
    user_id: 'user-1',
    color: 'blue',
    icon: 'users',
    is_active: true,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-3',
    name: '勉強',
    user_id: 'user-1',
    color: 'green',
    icon: 'book-open',
    is_active: true,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

// ─────────────────────────────────────────────────────────
// Interactive Wrapper
// ─────────────────────────────────────────────────────────

function TagCreateModalStory({ tags = EXISTING_TAGS }: { tags?: Tag[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>タグを作成</Button>
      <TagCreateModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSave={async (data) => {
          fn()(data);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }}
        existingTags={tags}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** ボタンクリックでモーダルを開く */
export const Default: Story = {
  render: () => <TagCreateModalStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // ボタンをクリックしてモーダルを開く
    const openButton = canvas.getByRole('button', { name: /タグを作成/i });
    await userEvent.click(openButton);

    // モーダルが開いたことを確認（ポータル経由）
    const body = within(document.body);
    await expect(body.getByText(/タグ名/i)).toBeInTheDocument();
  },
};

/** 初期表示（モーダルが開いた状態） */
export const OpenState: Story = {
  render: () => (
    <TagCreateModal
      isOpen
      onClose={fn()}
      onSave={async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }}
      existingTags={EXISTING_TAGS}
    />
  ),
  play: async () => {
    // モーダルはポータル経由でレンダリング
    const body = within(document.body);

    // モーダルが表示されていてフィールドが確認できる
    await expect(body.getByText(/タグ名/i)).toBeInTheDocument();
  },
};

/**
 * 既存タグあり状態
 *
 * existingTags を渡すとグループ候補ドロップダウンが表示される。
 * コロン記法のタグ（「仕事:会議」）から「仕事」がグループ候補として現れる。
 */
export const WithExistingTags: Story = {
  render: () => (
    <TagCreateModal
      isOpen
      onClose={fn()}
      onSave={async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }}
      existingTags={EXISTING_TAGS}
    />
  ),
};

/**
 * デフォルトグループあり状態
 *
 * defaultGroup を渡すとグループが事前選択された状態でモーダルが開く。
 * 選択グループの色が自動継承されるため、カラーピッカーは非表示になる。
 */
export const WithDefaultGroup: Story = {
  render: () => (
    <TagCreateModal
      isOpen
      onClose={fn()}
      onSave={async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }}
      existingTags={EXISTING_TAGS}
      defaultGroup="仕事"
    />
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">ボタンクリックでモーダルを開く</p>
        <TagCreateModalStory />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">初期表示（モーダルが開いた状態）</p>
        <TagCreateModal
          isOpen
          onClose={fn()}
          onSave={async () => {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }}
          existingTags={EXISTING_TAGS}
        />
      </div>
    </div>
  ),
};
