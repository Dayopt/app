/**
 * AiSidebar Stories
 *
 * AI モード Sidebar 中身 (Watching AI placeholder)。
 * 3 ブロック構成 (タイトル / 空 Conversations list / Soon セクション 3 項目)。
 * useTranslations 依存のため、同じ見た目の静的モックを使用 (ja 表記で固定)。
 * Phase 2-C Step C-6 で新設。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertCircle, FileText, Lightbulb } from 'lucide-react';

/**
 * AiSidebar の見た目を再現するモック。
 * 実装 (_shell/AiSidebar.tsx) と構造を同期する。
 */
function MockAiSidebar() {
  return (
    <div className="flex flex-col gap-4 px-2">
      <h2 className="text-foreground px-2 pt-2 text-sm font-medium">Watching AI</h2>

      <div className="px-2">
        <p className="text-muted-foreground text-sm">会話はまだありません</p>
      </div>

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
    <div className="flex flex-col gap-2 px-2">
      <span className="text-muted-foreground text-xs uppercase">予定</span>
      {SOON_ITEMS.map(({ key, Icon, title, description }) => (
        <div
          key={key}
          className="text-muted-foreground flex flex-col gap-1 py-1"
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

/** AI モード Sidebar (デフォルト): 3 ブロック構成。 */
export const Default: Story = {};
