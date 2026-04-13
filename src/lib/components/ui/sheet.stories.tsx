import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Calendar, CheckSquare, Menu, Settings } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from './button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './sheet';

/**
 * Sheet - スライドインパネル。
 *
 * ## 閉じるボタンのガイドライン
 *
 * | パターン | 閉じるボタン | 例 |
 * |----------|-------------|-----|
 * | サイドパネル（left/right） | あり（デフォルト） | ナビゲーション、フィルター |
 * | フルスクリーン（bottom, h-[100dvh]） | ヘッダーに配置 | モバイル設定画面 |
 * | ハーフシート（bottom, 固定高さ） | あり（デフォルト） | アクションメニュー |
 *
 * フルスクリーン Sheet は `showCloseButton={false}` にして、ヘッダー内にカスタム閉じるボタンを配置する。
 */
const meta = {
  title: 'Components/UI/Sheet',
  component: Sheet,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPatterns: Story = {
  render: function SheetStory() {
    const [leftOpen, setLeftOpen] = useState(false);
    const [bottomOpen, setBottomOpen] = useState(false);

    return (
      <div className="flex flex-col items-start gap-6">
        <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
          <Button variant="ghost" icon aria-label="メニュー" onClick={() => setLeftOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <SheetContent side="left" aria-label="ナビゲーション">
            <SheetHeader>
              <SheetTitle>メニュー</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-2 p-4">
              <Button variant="ghost" className="justify-start">
                <Calendar className="mr-2 size-4" />
                カレンダー
              </Button>
              <Button variant="ghost" className="justify-start">
                <CheckSquare className="mr-2 size-4" />
                タスク
              </Button>
              <Button variant="ghost" className="justify-start">
                <Settings className="mr-2 size-4" />
                設定
              </Button>
            </nav>
          </SheetContent>
        </Sheet>

        <Sheet open={bottomOpen} onOpenChange={setBottomOpen}>
          <Button onClick={() => setBottomOpen(true)}>設定を開く</Button>
          <SheetContent
            side="bottom"
            className="h-[100dvh]"
            showCloseButton={false}
            aria-label="設定"
          >
            <SheetHeader className="border-border border-b p-4">
              <div className="flex items-center justify-between">
                <SheetTitle>設定</SheetTitle>
                <Button variant="ghost" size="sm" onClick={() => setBottomOpen(false)}>
                  閉じる
                </Button>
              </div>
            </SheetHeader>
            <div className="p-4">
              <p className="text-muted-foreground">設定コンテンツ</p>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('button', { name: 'メニュー' });
    await userEvent.click(trigger);

    const body = within(document.body);
    await expect(await body.findByText('メニュー')).toBeVisible();

    const closeButton = await body.findByRole('button', { name: /close/i });
    await userEvent.click(closeButton);

    await expect(body.queryByRole('dialog', { name: 'ナビゲーション' })).not.toBeInTheDocument();
  },
};
