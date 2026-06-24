import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ScrollArea, ScrollBar, Separator } from '@dayopt/components';

/** ScrollArea - カスタムスクロールエリア */
const meta = {
  title: 'Shared/Components/Layout/ScrollArea',
  component: ScrollArea,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const tags = Array.from({ length: 50 }).map((_, i, a) => `タグ ${a.length - i}`);

export const Default: Story = {
  render: () => (
    <ScrollArea className="border-border h-72 w-48 rounded-lg border">
      <div className="p-4">
        <h2 className="mb-4 text-sm leading-none font-medium">タグ一覧</h2>
        {tags.map((tag) => (
          <div key={tag}>
            <div className="text-sm">{tag}</div>
            <Separator className="my-2" />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const HorizontalScroll: Story = {
  render: () => (
    <ScrollArea className="border-border w-96 rounded-lg border whitespace-nowrap">
      <div className="flex w-max space-x-4 p-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="bg-container flex h-32 w-32 shrink-0 items-center justify-center rounded-lg"
          >
            アイテム {i + 1}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};

export const BothDirections: Story = {
  render: () => (
    <ScrollArea className="border-border h-72 w-72 rounded-lg border">
      <div className="p-4" style={{ width: '600px' }}>
        <h2 className="mb-4 text-sm font-medium">縦横スクロール</h2>
        <div className="grid grid-cols-6 gap-4">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="bg-container flex h-20 w-20 items-center justify-center rounded-lg text-sm"
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};

export const InCard: Story = {
  render: () => (
    <div className="border-border w-80 rounded-lg border">
      <div className="border-border border-b p-4">
        <h2 className="font-medium">通知</h2>
      </div>
      <ScrollArea className="h-64">
        <div className="p-4">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="border-border border-b py-4 last:border-0">
              <p className="text-sm font-medium">通知 {i + 1}</p>
              <p className="text-muted-foreground text-xs">1時間前</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  ),
};

export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <ScrollArea className="border-border h-48 w-64 rounded-lg border">
        <div className="p-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="py-2 text-sm">
              アイテム {i + 1}
            </div>
          ))}
        </div>
      </ScrollArea>

      <ScrollArea className="border-border w-80 rounded-lg border">
        <div className="flex gap-4 p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="bg-container flex h-24 w-24 shrink-0 items-center justify-center rounded-lg"
            >
              {i + 1}
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  ),
};
