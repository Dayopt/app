/**
 * SidebarSection Stories
 *
 * サイドバー共通のセクション。
 * title + 右端 action + 常時表示 children。実際のサイドバー構成を再現したストーリーで視覚ヒエラルキーを確認。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ChevronRight, Moon, PanelLeft, Plus, Search } from 'lucide-react';

import { MiniCalendar } from '@/components/ui/inputs/mini-calendar';
import { ActivityIcon, getCategoryColorClasses } from '@/features/activities';
import { Checkbox } from '@dayopt/components';

import { withWrapper } from '@dayopt/storybook/decorators';
import { BlockItem } from './BlockItem';
import { SidebarSection } from './SidebarSection';

// ─────────────────────────────────────────────────────────
// モックパーツ
// ─────────────────────────────────────────────────────────

/** CreateTagButton と同一構造 */
function ActionButton() {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground hover:bg-state-hover flex size-8 items-center justify-center rounded-lg"
      onClick={fn()}
      aria-label="Add"
    >
      <Plus className="size-4" />
    </button>
  );
}

/**
 * borderColor/backgroundColor に getCategoryColorClasses().cssVar を使用。
 */
function TagRow({
  name,
  color,
  checked = true,
}: {
  name: string;
  color: string;
  checked?: boolean;
}) {
  const colorClasses = getCategoryColorClasses(color);
  return (
    <div className="hover:bg-state-hover group/item flex h-8 w-full min-w-0 cursor-pointer items-center rounded-lg text-sm">
      <Checkbox
        checked={checked}
        aria-label={name}
        className="ml-2 shrink-0 cursor-pointer"
        style={{
          borderColor: colorClasses.cssVar,
          backgroundColor: checked ? colorClasses.cssVar : 'transparent',
        }}
      />
      <span className="ml-1 min-w-0 flex-1 truncate">{name}</span>
    </div>
  );
}

/** Sidebar.tsx ヘッダーと同一構造 */
function MockSidebarHeader() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-2">
      <div className="flex items-center gap-2 pl-2">
        <div className="bg-primary size-5 rounded-lg" />
        <span className="text-foreground text-sm font-medium tracking-tight">Dayopt</span>
      </div>
      <div className="flex items-center">
        <button
          type="button"
          className="hover:bg-state-hover flex size-8 items-center justify-center rounded-lg"
          aria-label="Search"
        >
          <Search className="text-muted-foreground size-4" />
        </button>
        <button
          type="button"
          className="hover:bg-state-hover flex size-8 items-center justify-center rounded-lg"
          aria-label="Close sidebar"
        >
          <PanelLeft className="text-muted-foreground size-4" />
        </button>
      </div>
    </div>
  );
}

/** Sidebar.tsx フッターと同一構造 */
function MockSidebarFooter() {
  return (
    <div className="shrink-0 px-2 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary size-6 rounded-full" />
          <span className="text-sm">Tomoya</span>
          <ChevronRight className="text-muted-foreground size-3.5" />
        </div>
      </div>
    </div>
  );
}

/** SidebarUtilities と同一構造 */
function MockThemeToggle() {
  return (
    <div className="flex items-center gap-1 px-2 py-2">
      <button
        type="button"
        className="hover:bg-state-hover flex size-8 items-center justify-center rounded-lg"
        aria-label="Toggle theme"
      >
        <Moon className="text-muted-foreground size-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// デバッグラッパー（256px）
// ─────────────────────────────────────────────────────────

function SidebarShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border-border bg-surface-container flex w-[256px] flex-col border-r"
      style={{ height: 700 }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** SidebarSection — サイドバー共通のセクション。title + 右端 action + 常時表示 children。 */
const meta = {
  title: 'Product/Components/Shell/Sidebar/Section',
  component: SidebarSection,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SidebarSection>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

const today = new Date();
const noop = fn();

/** 基本的な使用例。 */
export const Default: Story = {
  args: {
    title: 'セクション',
    children: (
      <div className="space-y-1">
        <BlockItem
          tagName="仕事"
          iconSlot={<ActivityIcon icon={null} color="blue" size="sm" />}
          durationMinutes={60}
          onClick={noop}
        />
        <BlockItem
          tagName="勉強"
          iconSlot={<ActivityIcon icon={null} color="green" size="sm" />}
          durationMinutes={30}
          onClick={noop}
        />
      </div>
    ),
  },
  decorators: [withWrapper('w-64 px-2')],
};

/** action スロット付き（+ボタン）。 */
export const WithAction: Story = {
  args: {
    title: 'パレット',
    action: <ActionButton />,
    children: (
      <div className="space-y-1">
        <BlockItem
          tagName="仕事"
          iconSlot={<ActivityIcon icon={null} color="blue" size="sm" />}
          durationMinutes={60}
          onClick={noop}
        />
        <BlockItem
          tagName="運動"
          iconSlot={<ActivityIcon icon={null} color="teal" size="sm" />}
          durationMinutes={30}
          onClick={noop}
        />
      </div>
    ),
  },
  decorators: [withWrapper('w-64 px-2')],
};

/** サイドバー全体再現 — ヘッダー + カレンダー + タグ + パレット + 履歴 + テーマ + フッター。 */
export const FullSidebar: Story = {
  args: { title: '', children: null },
  render: () => (
    <SidebarShell>
      <MockSidebarHeader />

      {/* Sidebar scroll area: gap-4 (16px) between sections */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto">
        {/* MiniCalendar in SidebarSection */}
        <div className="px-2">
          <MiniCalendar
            selectedDate={today}
            onDateSelect={() => {}}
            className="-mx-2 w-[calc(100%+16px)] bg-transparent"
          />
        </div>

        {/* タグフィルター */}
        <div className="flex min-w-0 flex-col overflow-hidden px-2">
          <SidebarSection title="タグ" action={<ActionButton />}>
            <TagRow name="Work" color="blue" />
            <TagRow name="Learning" color="green" />
            <TagRow name="Life" color="amber" />
            <TagRow name="Exercise" color="teal" />
            <TagRow name="Hobby" color="violet" />
          </SidebarSection>
        </div>

        {/* パレット */}
        <div className="w-full min-w-0 overflow-hidden px-2">
          <SidebarSection title="パレット">
            <BlockItem
              tagName="Work"
              iconSlot={<ActivityIcon icon="briefcase" color="blue" size="sm" />}
              durationMinutes={60}
              onClick={noop}
            />
            <BlockItem
              tagName="Exercise"
              iconSlot={<ActivityIcon icon="dumbbell" color="teal" size="sm" />}
              durationMinutes={30}
              onClick={noop}
            />
          </SidebarSection>
        </div>

        {/* 履歴 */}
        <div className="w-full min-w-0 overflow-hidden px-2">
          <SidebarSection title="履歴">
            <BlockItem
              tagName="Work"
              iconSlot={<ActivityIcon icon="briefcase" color="blue" size="sm" />}
              durationMinutes={45}
              onClick={noop}
            />
            <BlockItem
              tagName="Learning"
              iconSlot={<ActivityIcon icon="book-open" color="green" size="sm" />}
              durationMinutes={30}
              onClick={noop}
            />
            <BlockItem
              tagName="Life"
              iconSlot={<ActivityIcon icon="heart" color="amber" size="sm" />}
              durationMinutes={15}
              onClick={noop}
            />
          </SidebarSection>
        </div>

        <MockThemeToggle />
      </div>

      <MockSidebarFooter />
    </SidebarShell>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { title: '', children: null },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Default</p>
        <div className="w-64 px-2">
          <SidebarSection title="セクション">
            <BlockItem
              tagName="仕事"
              iconSlot={<ActivityIcon icon={null} color="blue" size="sm" />}
              durationMinutes={60}
              onClick={noop}
            />
            <BlockItem
              tagName="勉強"
              iconSlot={<ActivityIcon icon={null} color="green" size="sm" />}
              durationMinutes={30}
              onClick={noop}
            />
          </SidebarSection>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">WithAction（+ボタン付き）</p>
        <div className="w-64 px-2">
          <SidebarSection title="パレット" action={<ActionButton />}>
            <BlockItem
              tagName="仕事"
              iconSlot={<ActivityIcon icon={null} color="blue" size="sm" />}
              durationMinutes={60}
              onClick={noop}
            />
          </SidebarSection>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">FullSidebar（全セクション構成）</p>
        <SidebarShell>
          <MockSidebarHeader />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto">
            <div className="px-2">
              <SidebarSection title="カレンダー">
                <MiniCalendar
                  selectedDate={today}
                  onDateSelect={() => {}}
                  className="-mx-2 w-[calc(100%+16px)] bg-transparent"
                />
              </SidebarSection>
            </div>
            <div className="flex min-w-0 flex-col overflow-hidden px-2">
              <SidebarSection title="タグ" action={<ActionButton />}>
                <TagRow name="Work" color="blue" />
                <TagRow name="Learning" color="green" />
                <TagRow name="Life" color="amber" />
              </SidebarSection>
            </div>
            <div className="w-full min-w-0 overflow-hidden px-2">
              <SidebarSection title="パレット">
                <BlockItem
                  tagName="Work"
                  iconSlot={<ActivityIcon icon={null} color="blue" size="sm" />}
                  durationMinutes={60}
                  onClick={noop}
                />
              </SidebarSection>
            </div>
            <div className="w-full min-w-0 overflow-hidden px-2">
              <SidebarSection title="履歴">
                <BlockItem
                  tagName="Work"
                  iconSlot={<ActivityIcon icon={null} color="blue" size="sm" />}
                  durationMinutes={45}
                  onClick={noop}
                />
              </SidebarSection>
            </div>
            <MockThemeToggle />
          </div>
          <MockSidebarFooter />
        </SidebarShell>
      </div>
    </div>
  ),
};
