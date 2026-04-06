import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Bell, PanelLeft } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { HoverTooltip } from '@/components/ui/tooltip';
import { useShellStore } from '@/shell/stores/useShellStore';

import { PRESET_AUTH } from '../../../../.storybook/mocks/presets';
import { Sidebar } from './Sidebar';

// ── Mock: サイドバーコンテンツ（SidebarContent の簡易版） ──

function MockSidebarContent() {
  return (
    <>
      <div className="p-4">
        <div className="bg-muted flex aspect-square w-full items-center justify-center rounded-lg">
          <span className="text-muted-foreground text-xs">Mini Calendar</span>
        </div>
      </div>
      <div className="space-y-1 px-2">
        {['Day', 'Week', 'Month'].map((label) => (
          <div
            key={label}
            className="text-muted-foreground hover:bg-state-hover rounded-lg px-4 py-2 text-sm"
          >
            {label}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Mock: フッターアクション ──

function MockFooterActions() {
  return (
    <Button variant="ghost" icon className="size-8" aria-label="Notifications">
      <Bell className="size-4" />
    </Button>
  );
}

/** サイドバーコンテナ。Dayoptロゴ + 検索 + 閉じるボタン、children スロット、UserMenu + footerActions。 */
const meta = {
  title: 'Components/Shell/Sidebar/Container',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
    storeMocks: {
      useAuthStore: PRESET_AUTH.authenticated,
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// インタラクティブデモ（実コンポーネント使用）
// ---------------------------------------------------------------------------

function InteractiveDemo({ sidebarLabel }: { sidebarLabel?: string }) {
  const [isOpen, setIsOpen] = useState(true);

  // Zustand storeと同期
  useEffect(() => {
    if (isOpen) {
      useShellStore.setState({ sidebar: { open: true, width: 256 } });
    } else {
      useShellStore.setState({ sidebar: { open: false, width: 256 } });
    }
  }, [isOpen]);

  return (
    <div className="border-border flex h-[500px] w-[800px] overflow-hidden rounded-2xl border">
      {/* サイドバー（実コンポーネント） */}
      <div
        className="shrink-0 overflow-hidden transition-all duration-200"
        style={{ width: isOpen ? 256 : 0 }}
      >
        <div className="h-full w-64">
          <Sidebar
            footerActions={<MockFooterActions />}
            {...(sidebarLabel ? { 'aria-label': sidebarLabel } : {})}
          >
            <MockSidebarContent />
          </Sidebar>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="bg-background flex flex-1 flex-col">
        <div className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-4">
          {!isOpen && (
            <HoverTooltip content="Open sidebar" side="bottom">
              <Button
                variant="ghost"
                icon
                className="size-8"
                onClick={() => setIsOpen(true)}
                aria-label="Open sidebar"
              >
                <PanelLeft className="size-4" />
              </Button>
            </HoverTooltip>
          )}
          <span className="text-muted-foreground text-sm">Header</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="bg-container text-muted-foreground rounded-lg p-6 text-center text-sm">
            Main Content
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** デフォルト状態。コンテンツスロットとフッターアクション付き。 */
export const Default: Story = {
  args: {
    children: <MockSidebarContent />,
    footerActions: <MockFooterActions />,
  },
  decorators: [
    (Story) => (
      <div className="h-[500px] w-64">
        <Story />
      </div>
    ),
  ],
};

/** コンテンツなし。children スロットが空の状態。 */
export const Empty: Story = {
  args: {
    children: (
      <div className="flex flex-1 items-center justify-center p-4">
        <span className="text-muted-foreground text-sm">No content</span>
      </div>
    ),
  },
  decorators: [
    (Story) => (
      <div className="h-[400px] w-64">
        <Story />
      </div>
    ),
  ],
};

/**
 * インタラクティブデモ。閉じるボタンでサイドバーが閉じ、ヘッダーの開くボタンで復元。
 *
 * 実装構成:
 * - ヘッダー: Dayoptロゴ + 検索ボタン + PanelLeft閉じるボタン
 * - コンテンツ: composition layerから注入（children スロット）
 * - フッター: UserMenu + footerActions（通知アイコン等）
 */
export const Interactive: StoryObj = {
  render: () => <InteractiveDemo />,
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    children: <MockSidebarContent />,
    footerActions: <MockFooterActions />,
  },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">
          デフォルト状態（コンテンツスロットとフッターアクション付き）
        </p>
        <div className="h-[500px] w-64">
          <Sidebar footerActions={<MockFooterActions />} aria-label="サイドバー（デフォルト）">
            <MockSidebarContent />
          </Sidebar>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">
          コンテンツなし（children スロットが空の状態）
        </p>
        <div className="h-[400px] w-64">
          <Sidebar aria-label="サイドバー（空）">
            <div className="flex flex-1 items-center justify-center p-4">
              <span className="text-muted-foreground text-sm">No content</span>
            </div>
          </Sidebar>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">インタラクティブデモ（開閉切り替え）</p>
        <InteractiveDemo sidebarLabel="サイドバー（インタラクティブ）" />
      </div>
    </div>
  ),
};
