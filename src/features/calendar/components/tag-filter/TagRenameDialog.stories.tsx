/**
 * TagRenameDialog Stories
 *
 * タグ名変更ダイアログのストーリー。
 * useTags は tRPC 経由で取得するため、preview.tsx の TRPCMockProvider が
 * コンテキストを提供する（data は undefined = 重複チェックスキップ）。
 * onSave は fn() でモックし、保存フローをテストする。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TagRenameDialog } from './TagRenameDialog';

const meta = {
  title: 'Features/Calendar/TagRenameDialog',
  component: TagRenameDialog,
  parameters: {
    layout: 'centered',
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
  args: {
    isOpen: true,
    onClose: fn(),
    onSave: fn(),
    currentName: 'Work',
    tagId: 'tag-mock-id',
  },
} satisfies Meta<typeof TagRenameDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト：既存のタグ名が入力済みの状態で開く。 */
export const Default: Story = {};

/** 短いタグ名：1文字のタグ名編集。 */
export const ShortName: Story = {
  args: {
    currentName: 'A',
  },
};

/** 長いタグ名：最大文字数に近い名前。 */
export const LongName: Story = {
  args: {
    currentName: 'Very Long Tag Name for Testing',
  },
};

/** 日本語タグ名：マルチバイト文字での表示確認。 */
export const JapaneseName: Story = {
  args: {
    currentName: '仕事・プロジェクト',
  },
};

/** 保存中：isLoading 状態を模擬するため、onSave が長時間かかる非同期処理を返す。 */
export const Saving: Story = {
  args: {
    onSave: fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 3000));
    }),
  },
};

/** 閉じた状態：isOpen=false でダイアログが非表示。 */
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground text-xs">デフォルト（英語タグ名）</p>
      <TagRenameDialog isOpen onClose={fn()} onSave={fn()} currentName="Work" tagId="tag-1" />
      <p className="text-muted-foreground text-xs">日本語タグ名</p>
      <TagRenameDialog
        isOpen
        onClose={fn()}
        onSave={fn()}
        currentName="仕事・プロジェクト"
        tagId="tag-2"
      />
    </div>
  ),
};
