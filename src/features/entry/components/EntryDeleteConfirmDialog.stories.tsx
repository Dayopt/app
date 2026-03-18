/**
 * EntryDeleteConfirmDialog Stories
 *
 * プラン削除確認ダイアログのストーリー。
 * useModalStore.setState で削除確認モーダルの状態を直接セットする。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { Button } from '@/components/ui/button';
import { useModalStore } from '@/shell/stores/useModalStore';

import { EntryDeleteConfirmDialog } from './EntryDeleteConfirmDialog';

const meta = {
  title: 'Features/Entry/EntryDeleteConfirmDialog',
  component: EntryDeleteConfirmDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EntryDeleteConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Interactive Wrapper
// ─────────────────────────────────────────────────────────

function DeleteConfirmDialogTrigger({ planTitle }: { planTitle?: string }) {
  const openModal = useModalStore.use.openModal();

  const handleOpen = () => {
    openModal({
      type: 'deleteConfirm',
      planId: 'plan-mock-id',
      planTitle: planTitle ?? null,
      onConfirm: async () => {
        await new Promise((r) => setTimeout(r, 800));
      },
    });
  };

  return (
    <>
      <Button variant="outline" onClick={handleOpen}>
        削除確認を開く
      </Button>
      <EntryDeleteConfirmDialog />
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** ボタンクリックで削除確認ダイアログを開く（タイトルあり）。 */
export const Default: Story = {
  render: () => <DeleteConfirmDialogTrigger planTitle="朝のミーティング" />,
};

/** タイトルなしの削除確認。汎用タイトル「削除しますか？」が表示される。 */
export const NoTitle: Story = {
  render: () => <DeleteConfirmDialogTrigger />,
};

/** 開いた状態（ストア直接操作）：プラン名あり。 */
export const OpenWithTitle: Story = {
  decorators: [
    (Story) => {
      useModalStore.setState({
        modal: {
          type: 'deleteConfirm',
          planId: 'plan-mock-id',
          planTitle: '朝のミーティング',
          onConfirm: fn(),
        },
      });
      return <Story />;
    },
  ],
};

/** 開いた状態（ストア直接操作）：プラン名なし。 */
export const OpenWithoutTitle: Story = {
  decorators: [
    (Story) => {
      useModalStore.setState({
        modal: {
          type: 'deleteConfirm',
          planId: 'plan-mock-id',
          planTitle: null,
          onConfirm: fn(),
        },
      });
      return <Story />;
    },
  ],
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground text-xs font-medium">タイトルありトリガー</p>
      <DeleteConfirmDialogTrigger planTitle="朝のミーティング" />
      <p className="text-muted-foreground text-xs font-medium">タイトルなしトリガー</p>
      <DeleteConfirmDialogTrigger />
    </div>
  ),
};
