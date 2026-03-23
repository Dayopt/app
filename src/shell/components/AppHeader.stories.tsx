import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AppHeader } from '@/shell/components/AppHeader';

// ─────────────────────────────────────────────────────────
// Stub UI Helpers
// ─────────────────────────────────────────────────────────

/** ヘッダーコントロール群のスタブ（DateNavigator等の代替） */
function StubControls() {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="border-border bg-container hover:bg-state-hover rounded-lg border px-3 py-1 text-xs"
      >
        前へ
      </button>
      <button
        type="button"
        className="border-border bg-container hover:bg-state-hover rounded-lg border px-3 py-1 text-xs"
      >
        今日
      </button>
      <button
        type="button"
        className="border-border bg-container hover:bg-state-hover rounded-lg border px-3 py-1 text-xs"
      >
        次へ
      </button>
    </div>
  );
}

/** 右スロットのスタブ（PageSwitcher等の代替） */
function StubRightSlot() {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="border-border bg-container hover:bg-state-hover rounded-lg border px-2 py-1 text-xs"
      >
        週
      </button>
      <button
        type="button"
        className="border-border bg-container hover:bg-state-hover rounded-lg border px-2 py-1 text-xs"
      >
        月
      </button>
    </div>
  );
}

/** AppHeader - アプリ共通ヘッダーシェル */
const meta = {
  title: 'Components/Shell/AppHeader',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** タイトル表示（通常ページ） */
export const Default: Story = {
  render: () => (
    <div className="border-border w-full border">
      <AppHeader>
        <h1 className="truncate text-lg leading-8 font-bold">Plans</h1>
      </AppHeader>
    </div>
  ),
};

/** モバイル表示。viewport addon で md:hidden / hidden md:flex が自動切替。 */
export const Mobile: Story = {
  render: () => (
    <div className="border-border w-full border">
      <AppHeader>
        <h1 className="truncate text-lg leading-8 font-bold">Plans</h1>
      </AppHeader>
    </div>
  ),
  globals: {
    viewport: { value: 'mobile1' },
  },
};

/**
 * controlsスロットあり（デスクトップのみ表示）
 *
 * DateNavigator / ViewSwitcher など日付ナビゲーション系コントロールを
 * 左コンテンツの右隣に配置するパターン。
 */
export const WithControls: Story = {
  render: () => (
    <div className="border-border w-full border">
      <AppHeader controls={<StubControls />}>
        <h1 className="truncate text-lg leading-8 font-bold">カレンダー</h1>
      </AppHeader>
    </div>
  ),
};

/**
 * rightSlotあり（デスクトップのみ表示）
 *
 * PageSwitcher など右端に配置するUIを rightSlot に注入するパターン。
 */
export const WithRightSlot: Story = {
  render: () => (
    <div className="border-border w-full border">
      <AppHeader rightSlot={<StubRightSlot />}>
        <h1 className="truncate text-lg leading-8 font-bold">カレンダー</h1>
      </AppHeader>
    </div>
  ),
};

/**
 * 全スロット埋め状態
 *
 * children / controls / rightSlot / mobileRightSlot の全スロットに
 * コンテンツを注入した最大構成を示す。
 */
export const FullyPopulated: Story = {
  render: () => (
    <div className="border-border w-full border">
      <AppHeader
        controls={<StubControls />}
        rightSlot={<StubRightSlot />}
        mobileRightSlot={
          <button
            type="button"
            className="border-border bg-container rounded-lg border px-2 py-1 text-xs"
          >
            検索
          </button>
        }
      >
        <h1 className="truncate text-lg leading-8 font-bold">カレンダー</h1>
      </AppHeader>
    </div>
  ),
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="border-border w-full border">
        <AppHeader>
          <h1 className="truncate text-lg leading-8 font-bold">Plans</h1>
        </AppHeader>
      </div>
      <div className="border-border w-full border">
        <AppHeader controls={<StubControls />}>
          <h1 className="truncate text-lg leading-8 font-bold">カレンダー（controls）</h1>
        </AppHeader>
      </div>
      <div className="border-border w-full border">
        <AppHeader rightSlot={<StubRightSlot />}>
          <h1 className="truncate text-lg leading-8 font-bold">カレンダー（rightSlot）</h1>
        </AppHeader>
      </div>
      <div className="border-border w-full border">
        <AppHeader
          controls={<StubControls />}
          rightSlot={<StubRightSlot />}
          mobileRightSlot={
            <button
              type="button"
              className="border-border bg-container rounded-lg border px-2 py-1 text-xs"
            >
              検索
            </button>
          }
        >
          <h1 className="truncate text-lg leading-8 font-bold">カレンダー（全スロット）</h1>
        </AppHeader>
      </div>
      <div className="border-border w-full border">
        <AppHeader>
          <h1 className="truncate text-lg leading-8 font-bold">Stats</h1>
        </AppHeader>
      </div>
    </div>
  ),
};
