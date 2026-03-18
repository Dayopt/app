import { Plus } from 'lucide-react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { Button } from '@/components/ui/button';

import { EntryCreateTrigger } from './EntryCreateTrigger';

/** エントリ作成トリガー。任意の要素にonClickを注入してエントリ作成フローを起動する。 */
const meta = {
  title: 'Features/Entry/EntryCreateTrigger',
  component: EntryCreateTrigger,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onSuccess: fn(),
  },
} satisfies Meta<typeof EntryCreateTrigger>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** Buttonをtriggerに渡した場合。onClickが注入される。 */
export const WithButton: Story = {
  args: {
    triggerElement: (
      <Button variant="primary" size="sm">
        <Plus className="size-4" />
        新規作成
      </Button>
    ),
  },
};

/** アイコンのみのボタンをtriggerに渡した場合。 */
export const WithIconButton: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  args: {
    triggerElement: (
      <Button variant="ghost" icon>
        <Plus className="size-5" />
      </Button>
    ),
  },
};

/** triggerElementが非ReactElement（文字列）の場合。フォールバックのbuttonでラップされる。 */
export const WithTextFallback: Story = {
  args: {
    triggerElement: <span className="text-primary cursor-pointer text-sm underline">＋ 追加</span>,
  },
};

/** 初期日付を指定した場合。 */
export const WithInitialDate: Story = {
  args: {
    triggerElement: (
      <Button variant="outline" size="sm">
        <Plus className="size-4" />
        今日の予定を作成
      </Button>
    ),
    initialDate: new Date('2026-03-18T09:00:00'),
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  args: {
    triggerElement: (
      <Button variant="primary" size="sm">
        <Plus className="size-4" />
        新規作成
      </Button>
    ),
  },
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">Button trigger</span>
        <EntryCreateTrigger
          triggerElement={
            <Button variant="primary" size="sm">
              <Plus className="size-4" />
              新規作成
            </Button>
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">Ghost icon trigger</span>
        <EntryCreateTrigger
          triggerElement={
            <Button variant="ghost" icon>
              <Plus className="size-5" />
            </Button>
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">Text fallback</span>
        <EntryCreateTrigger
          triggerElement={
            <span className="text-primary cursor-pointer text-sm underline">＋ 追加</span>
          }
        />
      </div>
    </div>
  ),
};
