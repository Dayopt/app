import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChevronDown, ChevronRight, Clock } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';

const meta = {
  title: 'Components/UI/Collapsible',
  component: Collapsible,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPatterns: Story = {
  parameters: { a11y: { config: { rules: [{ id: 'aria-allowed-attr', enabled: false }] } } },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="border-border rounded-lg border">
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <div className="hover:bg-state-hover flex h-8 w-full cursor-pointer items-center rounded-lg transition-colors">
              <div className="text-muted-foreground flex h-8 min-w-0 items-center px-2 text-left text-xs font-medium">
                <span className="truncate">セクションタイトル</span>
                <ChevronRight className="ml-1 size-4 shrink-0 transition-transform [[data-state=open]_&]:rotate-90" />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1 px-2 pb-2">
              <div className="hover:bg-state-hover rounded-lg px-2 py-2 text-sm">アイテム1</div>
              <div className="hover:bg-state-hover rounded-lg px-2 py-2 text-sm">アイテム2</div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="border-border rounded-lg border">
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <div className="flex h-10 w-full cursor-pointer items-center gap-2 px-4 transition-colors">
              <div className="border-border-subtle h-px flex-1 border-t" />
              <div className="hover:bg-state-hover flex items-center gap-1 rounded-lg px-2 py-1 transition-colors">
                <Clock className="text-muted-foreground size-3.5" />
                <span className="text-muted-foreground text-xs">Records (3)</span>
                <ChevronDown className="text-muted-foreground size-3.5 transition-transform [[data-state=open]_&]:rotate-180" />
              </div>
              <div className="border-border-subtle h-px flex-1 border-t" />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4">
              <div className="bg-surface-container mb-2 flex items-center justify-between rounded-lg p-2">
                <span className="text-muted-foreground text-xs">合計時間</span>
                <span className="text-sm font-medium">2時間30分</span>
              </div>
              <div className="space-y-2">
                <div className="hover:bg-state-hover flex items-center gap-2 rounded-lg p-2">
                  <span className="text-muted-foreground w-20 text-xs">2024-01-15</span>
                  <span className="text-sm">1時間</span>
                </div>
                <div className="hover:bg-state-hover flex items-center gap-2 rounded-lg p-2">
                  <span className="text-muted-foreground w-20 text-xs">2024-01-14</span>
                  <span className="text-sm">1時間30分</span>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  ),
};
