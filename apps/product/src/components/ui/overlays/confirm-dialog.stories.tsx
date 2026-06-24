import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '@dayopt/components';
import { ConfirmDialog } from './confirm-dialog';

const meta = {
  title: 'Product/Components/Overlays/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['destructive', 'warning', 'default'],
      description: 'ダイアログのスタイルバリアント',
    },
    title: {
      control: 'text',
      description: 'ダイアログのタイトル',
    },
    description: {
      control: 'text',
      description: '説明文',
    },
    confirmLabel: {
      control: 'text',
      description: '確認ボタンのラベル（省略時は翻訳キー）',
    },
    loadingLabel: {
      control: 'text',
      description: 'ローディング中のラベル',
    },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj;

/** 削除確認（variant="destructive"）。実使用: tags-list, PlanDeleteConfirmDialog, CalendarFilterList */
export const Destructive: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            削除確認を開く
          </Button>
          <ConfirmDialog
            open={open}
            onClose={() => setOpen(false)}
            onConfirm={() => setOpen(false)}
            title="このアイテムを削除しますか？"
            description="この操作は取り消せません。アイテムは完全に削除されます。"
            variant="destructive"
          />
        </>
      );
    }
    return <Demo />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '削除確認を開く' });
    await userEvent.click(trigger);

    const body = within(document.body);
    await expect(await body.findByText('このアイテムを削除しますか？')).toBeInTheDocument();
  },
};

/** 警告確認（variant="warning"）。破壊的ではないが注意が必要なアクション。 */
export const Warning: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            警告ダイアログを開く
          </Button>
          <ConfirmDialog
            open={open}
            onClose={() => setOpen(false)}
            onConfirm={() => setOpen(false)}
            title="この操作を続けますか？"
            description="設定を変更すると、既存のデータに影響する可能性があります。"
            variant="warning"
            confirmLabel="続ける"
          />
        </>
      );
    }
    return <Demo />;
  },
};

/** 汎用確認（variant="default"）。通常の確認アクション。 */
export const DefaultVariant: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            確認ダイアログを開く
          </Button>
          <ConfirmDialog
            open={open}
            onClose={() => setOpen(false)}
            onConfirm={() => setOpen(false)}
            title="変更を保存しますか？"
            description="変更内容が保存されます。"
            variant="default"
          />
        </>
      );
    }
    return <Demo />;
  },
};

/** confirmLabel / loadingLabel 指定 + 非同期処理。実使用: PlanDeleteConfirmDialog */
export const WithCustomLabels: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);

      const handleConfirm = async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setOpen(false);
      };

      return (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            プラン削除
          </Button>
          <ConfirmDialog
            open={open}
            onClose={() => setOpen(false)}
            onConfirm={handleConfirm}
            title="プランを削除しますか？"
            description="この操作は取り消せません。プランは完全に削除され、カレンダーからも削除されます。"
            variant="destructive"
            confirmLabel="削除"
            loadingLabel="削除中..."
          />
        </>
      );
    }
    return <Demo />;
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => {
    function AllPatternsDemo() {
      const [open1, setOpen1] = useState(false);
      const [open2, setOpen2] = useState(false);
      const [open3, setOpen3] = useState(false);
      const [open4, setOpen4] = useState(false);

      const handleConfirm2 = async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setOpen2(false);
      };

      return (
        <div className="flex flex-col items-start gap-6">
          <Button variant="outline" onClick={() => setOpen1(true)}>
            削除確認を開く
          </Button>
          <ConfirmDialog
            open={open1}
            onClose={() => setOpen1(false)}
            onConfirm={() => setOpen1(false)}
            title="このアイテムを削除しますか？"
            description="この操作は取り消せません。アイテムは完全に削除されます。"
            variant="destructive"
          />

          <Button variant="outline" onClick={() => setOpen2(true)}>
            プラン削除
          </Button>
          <ConfirmDialog
            open={open2}
            onClose={() => setOpen2(false)}
            onConfirm={handleConfirm2}
            title="プランを削除しますか？"
            description="この操作は取り消せません。プランは完全に削除され、カレンダーからも削除されます。"
            variant="destructive"
            confirmLabel="削除"
            loadingLabel="削除中..."
          />

          <Button variant="outline" onClick={() => setOpen3(true)}>
            警告ダイアログを開く
          </Button>
          <ConfirmDialog
            open={open3}
            onClose={() => setOpen3(false)}
            onConfirm={() => setOpen3(false)}
            title="この操作を続けますか？"
            description="設定を変更すると、既存のデータに影響する可能性があります。"
            variant="warning"
            confirmLabel="続ける"
          />

          <Button variant="outline" onClick={() => setOpen4(true)}>
            確認ダイアログを開く
          </Button>
          <ConfirmDialog
            open={open4}
            onClose={() => setOpen4(false)}
            onConfirm={() => setOpen4(false)}
            title="変更を保存しますか？"
            description="変更内容が保存されます。"
            variant="default"
          />
        </div>
      );
    }
    return <AllPatternsDemo />;
  },
};
