import { useEffect } from 'react';
import { toast } from 'sonner';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@/components/ui/button';

import { openRecurringEditConfirm } from '@/stores/useModalStore';

import { RecurringEditConfirmDialog } from './RecurringEditConfirmDialog';

/** RecurringEditConfirmDialog - 繰り返しプランのスコープ選択ダイアログ */
const meta = {
  title: 'Features/Entry/Recurrence/RecurringEditConfirmDialog',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Interactive Wrapper
// ─────────────────────────────────────────────────────────

function ConfirmDialogStory({ mode }: { mode: 'edit' | 'delete' }) {
  const handleOpen = () => {
    openRecurringEditConfirm('テストプラン', mode, async (scope) => {
      toast.info(`選択: ${scope}`);
    });
  };

  // Story表示時に自動で開く
  useEffect(() => {
    handleOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <Button onClick={handleOpen}>ダイアログを開く</Button>
      <RecurringEditConfirmDialog />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 編集モード（このイベントのみ / 以降すべて / すべて） */
export const EditMode: Story = {
  render: () => <ConfirmDialogStory mode="edit" />,
};

/** 削除モード（破壊的操作） */
export const DeleteMode: Story = {
  render: () => <ConfirmDialogStory mode="delete" />,
};

/**
 * 全パターン一覧。
 *
 * グローバルモーダルストアは 1 つのダイアログしか保持できないため、
 * 2 つのインスタンスを同時にレンダリングすると後者が前者を上書きする。
 * AllPatterns では EditMode / DeleteMode を静的な説明カードで並べて比較する。
 * 動作確認は EditMode / DeleteMode の個別ストーリーを使用すること。
 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="border-border rounded-lg border p-4">
        <p className="text-foreground mb-1 text-sm font-medium">EditMode（編集モード）</p>
        <p className="text-muted-foreground text-xs">
          「このイベントのみ」「以降すべて」「すべて」の 3 択を提示する。
          <br />
          動作確認: <strong>EditMode</strong> ストーリーを参照。
        </p>
      </div>
      <div className="border-border rounded-lg border p-4">
        <p className="text-foreground mb-1 text-sm font-medium">DeleteMode（削除モード）</p>
        <p className="text-muted-foreground text-xs">
          削除用の破壊的操作ラベルで同じ 3 択を提示する。
          <br />
          動作確認: <strong>DeleteMode</strong> ストーリーを参照。
        </p>
      </div>
      <p className="text-muted-foreground text-xs">
        ※ グローバルストアの制約上、同画面で 2 つのダイアログを同時展開することはできない。
      </p>
    </div>
  ),
};
