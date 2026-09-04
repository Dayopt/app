/**
 * SidebarIconButton Stories
 *
 * サイドバーの 24px アイコンボタン。見た目は 24px のまま、擬似要素でタップ
 * ターゲットだけ 44px を確保する（AGENTS.md の Non-Negotiables）。
 *
 * `revealOn` を渡すと常時は隠れ、囲っている group にホバー / フォーカスした
 * 時だけ現れる。ホバーだけに頼るとキーボードとタッチから到達できなくなるため、
 * `group-has-[:focus-visible]` と `[@media(hover:none)]` も同じ条件に入れてある。
 * その挙動は Canvas で group をホバーするか、Tab で辿ると確認できる。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ChevronRight, Eye, EyeOff, MoreHorizontal } from 'lucide-react';

import { SidebarIconButton } from './SidebarIconButton';

const meta = {
  title: 'Product/Components/Shell/Sidebar/IconButton',
  component: SidebarIconButton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    'aria-label': 'メニューを開く',
    onClick: fn(),
    children: <MoreHorizontal className="size-4" />,
  },
  argTypes: {
    revealOn: {
      control: 'inline-radio',
      options: [undefined, 'item', 'section'],
      description: '常時は隠し、この named group にホバー / フォーカスした時だけ出す',
    },
  },
} satisfies Meta<typeof SidebarIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 常時表示。畳んでいるセクションの chevron など、隠すと戻る手段が無くなる場合に使う。 */
export const Default: Story = {};

/** 行（group/item）にホバーした時だけ現れる。行の外にカーソルがある間は透明。 */
export const RevealOnItem: Story = {
  args: { revealOn: 'item' },
  render: function RevealOnItemStory(args) {
    return (
      <div className="group/item hover:bg-state-hover flex h-8 w-64 items-center rounded-lg px-2 text-sm">
        <span className="text-foreground min-w-0 flex-1 truncate">会議</span>
        <SidebarIconButton {...args} />
      </div>
    );
  },
};

/** 見出し（group/section）にホバーした時だけ現れる。 */
export const RevealOnSection: Story = {
  args: { revealOn: 'section' },
  render: function RevealOnSectionStory(args) {
    return (
      <div className="group/section flex h-8 w-64 items-center gap-1 px-2">
        <span className="text-muted-foreground min-w-0 truncate text-sm">カテゴリ</span>
        <SidebarIconButton {...args} />
      </div>
    );
  },
};

/** 無効状態。 */
export const Disabled: Story = {
  args: { disabled: true },
};

/**
 * 隠れているボタンが Tab 順に残っていることを確認する。
 *
 * ホバーでしか出ない affordance を `hidden` や `display:none` で隠すと、
 * キーボードから永久に到達できなくなる。`opacity-0` はその点で正しく、
 * この test はそこが崩れた時に落ちる。
 *
 * 「フォーカスすると実際に見える」ことまでは assert しない。`:focus-visible`
 * は直前の入力モダリティに依存し、`userEvent.tab()` の focus 呼び出しでは
 * 一致しないことがあるため、緑/赤が挙動ではなく実行環境で決まってしまう
 * （2026-09-04 実測）。見える側はブラウザで実キー入力を送って確認済み。
 */
export const KeyboardReveal: Story = {
  args: { revealOn: 'item' },
  render: function KeyboardRevealStory(args) {
    return (
      <div className="group/item flex h-8 w-64 items-center rounded-lg px-2 text-sm">
        <span className="text-foreground min-w-0 flex-1 truncate">会議</span>
        <SidebarIconButton {...args} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'メニューを開く' });

    // 静止状態では見えていない
    await expect(button).toHaveStyle({ opacity: '0' });

    // それでも Tab で到達できる
    await userEvent.tab();
    await expect(button).toHaveFocus();
  },
};

/**
 * タップターゲットが 44px あることを確認する。
 *
 * 見た目は 24px なので、実寸だけを見ても Non-Negotiables を満たしているか
 * 分からない。擬似要素の実効サイズを直接測る。
 */
export const TapTargetSize: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'メニューを開く' });

    const box = button.getBoundingClientRect();
    await expect(Math.round(box.width)).toBe(24);
    await expect(Math.round(box.height)).toBe(24);

    const hitArea = getComputedStyle(button, '::after');
    await expect(hitArea.width).toBe('44px');
    await expect(hitArea.height).toBe('44px');
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <SidebarIconButton aria-label="メニューを開く">
          <MoreHorizontal className="size-4" />
        </SidebarIconButton>
        <SidebarIconButton aria-label="セクションを展開" aria-expanded={false}>
          <ChevronRight className="size-4" />
        </SidebarIconButton>
        <SidebarIconButton aria-label="カレンダーから非表示">
          <Eye className="size-3.5" />
        </SidebarIconButton>
        <SidebarIconButton aria-label="カレンダーに表示">
          <EyeOff className="size-3.5" />
        </SidebarIconButton>
        <SidebarIconButton aria-label="無効なボタン" disabled>
          <MoreHorizontal className="size-4" />
        </SidebarIconButton>
      </div>

      <div className="group/item hover:bg-state-hover flex h-8 w-64 items-center rounded-lg px-2 text-sm">
        <span className="text-foreground min-w-0 flex-1 truncate">会議</span>
        <SidebarIconButton aria-label="カレンダーから非表示" revealOn="item">
          <Eye className="size-3.5" />
        </SidebarIconButton>
        <SidebarIconButton aria-label="アクティビティメニュー" revealOn="item">
          <MoreHorizontal className="size-4" />
        </SidebarIconButton>
      </div>

      <div className="group/section flex h-8 w-64 items-center gap-1 px-2">
        <span className="text-muted-foreground min-w-0 truncate text-sm">カテゴリ</span>
        <SidebarIconButton aria-label="セクションを折りたたむ" aria-expanded revealOn="section">
          <ChevronRight className="size-4 rotate-90" />
        </SidebarIconButton>
      </div>
    </div>
  ),
};
