/**
 * AiSidebar Stories
 *
 * AI モード Sidebar 中身 (Watching AI placeholder)。
 * 2 ブロック構成 (Watching AI セクション + Coming Soon セクション)。
 * useTranslations 依存のため、同じ見た目の静的モックを使用 (ja 表記で固定)。
 * Phase 2-C Step C-6 で新設。Phase 2-D Step D-6 で見出しを SidebarSection に統一。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertCircle, FileText, Lightbulb } from 'lucide-react';

import type { ReactNode } from 'react';

// SidebarSection の DOM を stories 内で再現する mock (barrel 依存回避)。
function MockSidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="w-full min-w-0 overflow-hidden">
      <div className="flex h-8 w-full items-center">
        <h3 className="text-muted-foreground min-w-0 truncate px-2 text-sm font-medium">{title}</h3>
      </div>
      <div className="w-full min-w-0 overflow-hidden">{children}</div>
    </section>
  );
}

/**
 * AiSidebar の見た目を再現するモック。
 * 実装 (_shell/AiSidebar.tsx) と構造を同期する。
 */
function MockAiSidebar() {
  return (
    <div className="flex flex-col gap-4 px-2">
      <MockSidebarSection title="Watching AI">
        <p className="text-muted-foreground px-2 py-2 text-sm">会話はまだありません</p>
      </MockSidebarSection>

      <MockAiSoonList />
    </div>
  );
}

const SOON_ITEMS = [
  {
    key: 'weeklyReport',
    Icon: FileText,
    title: '週次レポート',
    description: '今週の時間の使い方をまとめてお届けします',
  },
  {
    key: 'insights',
    Icon: Lightbulb,
    title: '気づき',
    description: 'パターンから見つけた気づきを共有します',
  },
  {
    key: 'anomaly',
    Icon: AlertCircle,
    title: '異常検知',
    description: 'いつもと違う兆しを静かにお知らせします',
  },
] as const;

function MockAiSoonList() {
  return (
    <MockSidebarSection title="予定">
      <div className="flex flex-col">
        {SOON_ITEMS.map(({ key, Icon, title, description }) => (
          <div
            key={key}
            className="text-muted-foreground flex flex-col gap-1 px-2 py-2"
            aria-disabled="true"
          >
            <div className="flex items-center gap-2">
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="text-sm">{title}</span>
            </div>
            <span className="text-xs">{description}</span>
          </div>
        ))}
      </div>
    </MockSidebarSection>
  );
}

const meta = {
  title: 'Components/Shell/Sidebar/AiSidebar',
  component: MockAiSidebar,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div className="bg-surface-container w-64 rounded-lg py-4">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof MockAiSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** AI モード Sidebar (デフォルト): 2 ブロック構成 (Watching AI + 予定)。 */
export const Default: Story = {};
