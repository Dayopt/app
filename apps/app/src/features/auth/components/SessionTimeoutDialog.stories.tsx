import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button } from '@/lib/components/ui/button';

import { SessionTimeoutDialog } from './SessionTimeoutDialog';

/** SessionTimeoutDialog - セッションタイムアウト警告 */
const meta = {
  title: 'Features/Auth/SessionTimeoutDialog',
  component: SessionTimeoutDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SessionTimeoutDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Interactive Wrapper
// ─────────────────────────────────────────────────────────

function SessionTimeoutDialogStory() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>タイムアウト警告を表示</Button>
      <SessionTimeoutDialog
        open={open}
        remainingTime={180}
        onExtend={async () => setOpen(false)}
        onLogout={async () => setOpen(false)}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** ボタンクリックでダイアログを開く */
export const Default: Story = {
  args: {
    open: false,
    remainingTime: 180,
    onExtend: fn(),
    onLogout: fn(),
  },
  render: () => <SessionTimeoutDialogStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const openButton = canvas.getByRole('button', { name: /タイムアウト/i });
    await userEvent.click(openButton);

    // ポータル経由でダイアログが開く
    const body = within(document.body);
    await expect(body.getByRole('alertdialog')).toBeInTheDocument();
  },
};

/** 残り3分 */
export const ThreeMinutes: Story = {
  args: {
    open: true,
    remainingTime: 180,
    onExtend: fn(),
    onLogout: fn(),
  },
};

/** 残り1分 */
export const OneMinute: Story = {
  args: {
    open: true,
    remainingTime: 60,
    onExtend: fn(),
    onLogout: fn(),
  },
};

/** 残り10秒 */
export const TenSeconds: Story = {
  args: {
    open: true,
    remainingTime: 10,
    onExtend: fn(),
    onLogout: fn(),
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    open: false,
    remainingTime: 0,
    onExtend: async () => undefined,
    onLogout: async () => undefined,
  },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground mb-2 text-xs">Default（トリガーボタン）</p>
      <SessionTimeoutDialogStory />
      <p className="text-muted-foreground mb-2 text-xs">ThreeMinutes（残り3分）</p>
      <SessionTimeoutDialog
        open={true}
        remainingTime={180}
        onExtend={async () => undefined}
        onLogout={async () => undefined}
      />
      <p className="text-muted-foreground mb-2 text-xs">OneMinute（残り1分）</p>
      <SessionTimeoutDialog
        open={true}
        remainingTime={60}
        onExtend={async () => undefined}
        onLogout={async () => undefined}
      />
      <p className="text-muted-foreground mb-2 text-xs">TenSeconds（残り10秒）</p>
      <SessionTimeoutDialog
        open={true}
        remainingTime={10}
        onExtend={async () => undefined}
        onLogout={async () => undefined}
      />
    </div>
  ),
};
