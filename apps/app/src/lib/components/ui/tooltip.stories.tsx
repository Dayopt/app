import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Filter, Info, Search, Settings, SortAsc } from 'lucide-react';
import { expect, within } from 'storybook/test';

import { Button } from './button';
import { HoverTooltip } from './tooltip';

const meta = {
  title: 'Components/UI/Tooltip',
  component: HoverTooltip,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HoverTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPatterns: Story = {
  args: {
    content: 'Tooltip',
    children: <span>Trigger</span>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Verify tooltip trigger buttons render
    await expect(canvas.getByRole('button', { name: '検索' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'フィルター' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'ソート' })).toBeInTheDocument();
    // '設定' appears twice in the render, so use getAllByRole
    const settingsButtons = canvas.getAllByRole('button', { name: '設定' });
    await expect(settingsButtons.length).toBe(2);
  },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="flex gap-2">
        <HoverTooltip content="検索" side="top">
          <Button variant="ghost" icon aria-label="検索">
            <Search className="size-5" />
          </Button>
        </HoverTooltip>
        <HoverTooltip content="フィルター" side="top">
          <Button variant="ghost" icon aria-label="フィルター">
            <Filter className="size-5" />
          </Button>
        </HoverTooltip>
        <HoverTooltip content="ソート" side="top">
          <Button variant="ghost" icon aria-label="ソート">
            <SortAsc className="size-5" />
          </Button>
        </HoverTooltip>
        <HoverTooltip content="設定" side="top">
          <Button variant="ghost" icon aria-label="設定">
            <Settings className="size-5" />
          </Button>
        </HoverTooltip>
      </div>

      <div className="flex gap-2">
        <HoverTooltip content="ホーム" side="bottom">
          <Button variant="ghost" icon aria-label="ホーム">
            <Info className="size-5" />
          </Button>
        </HoverTooltip>
        <HoverTooltip content="設定" side="bottom">
          <Button variant="ghost" icon aria-label="設定">
            <Settings className="size-5" />
          </Button>
        </HoverTooltip>
      </div>

      <div className="flex flex-col gap-2">
        <HoverTooltip content="短いテキストは省略されない" disabled>
          <span className="text-foreground truncate text-sm">短いテキスト</span>
        </HoverTooltip>
        <HoverTooltip content="長いテキストは省略されるのでツールチップで全文を表示">
          <span className="text-foreground block w-32 truncate text-sm">
            長いテキストは省略されるのでツールチップで全文を表示
          </span>
        </HoverTooltip>
      </div>

      <div className="flex flex-wrap gap-2">
        <HoverTooltip content="top（デフォルト）" side="top">
          <Button variant="outline" size="sm">
            上
          </Button>
        </HoverTooltip>
        <HoverTooltip content="bottom" side="bottom">
          <Button variant="outline" size="sm">
            下
          </Button>
        </HoverTooltip>
        <HoverTooltip content="left" side="left">
          <Button variant="outline" size="sm">
            左
          </Button>
        </HoverTooltip>
        <HoverTooltip content="right" side="right">
          <Button variant="outline" size="sm">
            右
          </Button>
        </HoverTooltip>
      </div>
    </div>
  ),
};
