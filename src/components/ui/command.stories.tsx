import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Calculator, Calendar, CreditCard, Settings, Smile, User } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from './button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from './command';

const meta = {
  title: 'Components/UI/Command',
  component: Command,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-96">
      <Command className="shadow-card rounded-lg border">
        <CommandInput placeholder="検索..." />
        <CommandList>
          <CommandEmpty>結果がありません。</CommandEmpty>
          <CommandGroup heading="候補">
            <CommandItem>
              <Calendar className="mr-2" />
              <span>カレンダー</span>
            </CommandItem>
            <CommandItem>
              <Smile className="mr-2" />
              <span>絵文字を検索</span>
            </CommandItem>
            <CommandItem>
              <Calculator className="mr-2" />
              <span>計算機</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="設定">
            <CommandItem>
              <User className="mr-2" />
              <span>プロフィール</span>
              <CommandShortcut>⌘P</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <CreditCard className="mr-2" />
              <span>請求</span>
              <CommandShortcut>⌘B</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Settings className="mr-2" />
              <span>設定</span>
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 初期状態で候補が表示されている
    await expect(canvas.getByText('カレンダー')).toBeInTheDocument();
    await expect(canvas.getByText('プロフィール')).toBeInTheDocument();

    // 検索入力にテキストを入力
    const searchInput = canvas.getByPlaceholderText('検索...');
    await userEvent.type(searchInput, 'カレンダー');
    await expect(searchInput).toHaveValue('カレンダー');
  },
};

export const Dialog: Story = {
  render: function CommandDialogStory() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>
          コマンドパレットを開く
          <kbd className="bg-muted text-muted-foreground pointer-events-none ml-2 inline-flex h-5 items-center gap-1 rounded-lg border px-2 font-mono text-xs font-medium opacity-100 select-none">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder="コマンドを検索..." />
          <CommandList>
            <CommandEmpty>結果がありません。</CommandEmpty>
            <CommandGroup heading="アクション">
              <CommandItem>
                <Calendar className="mr-2" />
                <span>新しいイベント</span>
              </CommandItem>
              <CommandItem>
                <User className="mr-2" />
                <span>プロフィール</span>
              </CommandItem>
              <CommandItem>
                <Settings className="mr-2" />
                <span>設定</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // ボタンをクリックしてダイアログを開く
    const openButton = canvas.getByRole('button', { name: /コマンドパレットを開く/i });
    await userEvent.click(openButton);

    // ダイアログ内のコンテンツを確認（ポータル経由なので document.body を使用）
    const body = within(document.body);
    await expect(body.getByPlaceholderText('コマンドを検索...')).toBeInTheDocument();
    await expect(body.getByText('新しいイベント')).toBeInTheDocument();

    // Escapeキーでダイアログを閉じる
    await userEvent.keyboard('{Escape}');
  },
};

export const WithShortcuts: Story = {
  render: () => (
    <div className="w-96">
      <Command className="shadow-card rounded-lg border">
        <CommandInput placeholder="検索..." />
        <CommandList>
          <CommandEmpty>結果がありません。</CommandEmpty>
          <CommandGroup heading="アクション">
            <CommandItem>
              <span>新規作成</span>
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <span>保存</span>
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <span>コピー</span>
              <CommandShortcut>⌘C</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <span>ペースト</span>
              <CommandShortcut>⌘V</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ),
};

export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    const [dialogOpen, setDialogOpen] = useState(false);
    return (
      <div className="flex flex-col items-start gap-6">
        <div className="w-96">
          <Command className="shadow-card rounded-lg border">
            <CommandInput placeholder="検索..." />
            <CommandList>
              <CommandEmpty>結果がありません。</CommandEmpty>
              <CommandGroup heading="アプリ">
                <CommandItem>
                  <Calendar className="mr-2" />
                  <span>カレンダー</span>
                </CommandItem>
                <CommandItem>
                  <Settings className="mr-2" />
                  <span>設定</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>

        <Button variant="outline" onClick={() => setDialogOpen(true)}>
          ⌘K でコマンドパレットを開く
        </Button>
        <CommandDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <CommandInput placeholder="コマンドを検索..." />
          <CommandList>
            <CommandEmpty>結果がありません。</CommandEmpty>
            <CommandGroup heading="アクション">
              <CommandItem onSelect={() => setDialogOpen(false)}>
                <Calendar className="mr-2" />
                <span>新しいイベント</span>
                <CommandShortcut>⌘E</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => setDialogOpen(false)}>
                <User className="mr-2" />
                <span>プロフィール</span>
                <CommandShortcut>⌘P</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="設定">
              <CommandItem onSelect={() => setDialogOpen(false)}>
                <Settings className="mr-2" />
                <span>設定を開く</span>
                <CommandShortcut>⌘,</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
    );
  },
};
