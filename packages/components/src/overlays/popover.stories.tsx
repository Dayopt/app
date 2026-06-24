import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import {
  Button,
  Input,
  Label,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@dayopt/components';

/** Popover - ポップオーバー。PopoverTrigger（ボタン開閉）とPopoverAnchor（Input開閉）の2パターンを提供。 */
const meta = {
  title: 'Shared/Components/Overlays/Popover',
  component: Popover,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  // aria-dialog-name: Radix Popover portal has role="dialog" without accessible name
  parameters: { a11y: { test: 'todo' } },
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">ポップオーバーを開く</Button>
      </PopoverTrigger>
      <PopoverContent>
        <p>これはポップオーバーのコンテンツです。</p>
      </PopoverContent>
    </Popover>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'ポップオーバーを開く' });
    await userEvent.click(trigger);

    const body = within(document.body);
    await expect(
      await body.findByText('これはポップオーバーのコンテンツです。'),
    ).toBeInTheDocument();
  },
};

export const WithForm: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">設定を変更</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="leading-none font-medium">寸法</h4>
            <p className="text-muted-foreground text-sm">レイヤーの寸法を設定します。</p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="width">幅</Label>
              <Input id="width" defaultValue="100%" className="col-span-2 h-8" />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="maxWidth">最大幅</Label>
              <Input id="maxWidth" defaultValue="300px" className="col-span-2 h-8" />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="height">高さ</Label>
              <Input id="height" defaultValue="25px" className="col-span-2 h-8" />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const Positions: Story = {
  render: () => (
    <div className="flex gap-4">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            上
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-40">
          <p className="text-sm">上に表示</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            下
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" className="w-40">
          <p className="text-sm">下に表示</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            左
          </Button>
        </PopoverTrigger>
        <PopoverContent side="left" className="w-40">
          <p className="text-sm">左に表示</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            右
          </Button>
        </PopoverTrigger>
        <PopoverContent side="right" className="w-40">
          <p className="text-sm">右に表示</p>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const Alignment: Story = {
  render: () => (
    <div className="flex gap-4">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            開始
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-40">
          <p className="text-sm">開始位置に揃える</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            中央
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-40">
          <p className="text-sm">中央に揃える</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            終了
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-40">
          <p className="text-sm">終了位置に揃える</p>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

/** PopoverAnchor を使った Combobox 風パターン。Input をアンカーにしてドロップダウンを表示する用途。 */
export const WithAnchor: Story = {
  render: function WithAnchorStory() {
    const [isOpen, setIsOpen] = useState(false);
    const [value, setValue] = useState('10:00');

    const options = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'];

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setIsOpen(true)}
            className="w-24"
            placeholder="--:--"
            aria-label="Time"
          />
        </PopoverAnchor>
        <PopoverContent className="w-24 p-1" align="start">
          <div className="space-y-1">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                className={`hover:bg-state-hover w-full rounded-lg px-2 py-1 text-left text-sm ${
                  option === value ? 'bg-state-selected' : ''
                }`}
                onClick={() => {
                  setValue(option);
                  setIsOpen(false);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
};

/** リスト表示Popover。ヘッダー + スクロールリスト（OverdueBadge等で使用）。 */
export const WithList: Story = {
  render: () => {
    const items = [
      {
        id: '1',
        date: '今日',
        title: 'チームミーティング',
        time: '10:00',
        color: 'var(--primary)',
      },
      { id: '2', date: '今日', title: 'デザインレビュー', time: '14:00', color: 'blue' },
      { id: '3', date: '昨日', title: 'コードレビュー', time: '16:00', color: 'red' },
      { id: '4', date: '2/7', title: '週次レポート作成', time: '時間は未指定', color: 'green' },
    ];

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            4件の項目
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          {/* ヘッダー */}
          <div className="flex items-start justify-between px-4 py-4">
            <div className="flex-1">
              <h4 className="text-foreground text-sm font-medium">保留中のタスク</h4>
              <p className="text-muted-foreground text-xs">過去365日間</p>
            </div>
          </div>

          {/* スクロールリスト */}
          <div className="divide-border max-h-64 divide-y overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="group hover:bg-state-hover focus-visible:bg-state-hover grid w-full cursor-pointer grid-cols-[2.5rem_1fr_auto] items-center gap-2 px-4 py-2 text-left transition-colors duration-150 focus-visible:outline-none"
              >
                <span className="text-muted-foreground text-right text-sm tabular-nums">
                  {item.date}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-foreground truncate text-sm group-hover:underline">
                    {item.title}
                  </span>
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">{item.time}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">ポップオーバー</Button>
        </PopoverTrigger>
        <PopoverContent>
          <p>シンプルなポップオーバー</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button>設定</Button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name-popover">名前</Label>
              <Input id="name-popover" placeholder="名前を入力" />
            </div>
            <Button className="w-full">保存</Button>
          </div>
        </PopoverContent>
      </Popover>
      <div className="flex flex-wrap gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              上
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-32">
            上
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              下
            </Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" className="w-32">
            下
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              左
            </Button>
          </PopoverTrigger>
          <PopoverContent side="left" className="w-32">
            左
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              右
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" className="w-32">
            右
          </PopoverContent>
        </Popover>
      </div>
    </div>
  ),
};
