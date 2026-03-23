import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ChevronRight, Moon, PanelLeft, Plus, Search } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { MiniCalendar } from '@/components/ui/mini-calendar';

import { SidebarSection } from './SidebarSection';

/** SidebarSection — サイドバー余白デバッグ */
const meta = {
  title: 'Components/SidebarSection',
  component: SidebarSection,
  parameters: {
    layout: 'centered',
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SidebarSection>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// 実コンポーネント再現パーツ
// ─────────────────────────────────────────────────────────

/** CreateTagButton / PaletteAddPopover と同一: size-6 */
function ActionButton() {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground hover:bg-state-hover flex size-8 items-center justify-center rounded"
      onClick={fn()}
    >
      <Plus className="size-4" />
    </button>
  );
}

/** SortableTagItem と同一構造 */
function TagRow({
  name,
  color,
  checked = true,
}: {
  name: string;
  color: string;
  checked?: boolean;
}) {
  return (
    <div className="hover:bg-state-hover group/item flex h-8 cursor-grab items-center rounded text-sm">
      <Checkbox
        checked={checked}
        className="ml-2 shrink-0 cursor-pointer"
        style={{
          borderColor: color,
          backgroundColor: checked ? color : 'transparent',
        }}
      />
      <span className="ml-1 min-w-0 flex-1 truncate">{name}</span>
    </div>
  );
}

/** PaletteItem と同一構造 */
function PaletteRow({
  tagName,
  tagColor,
  duration,
}: {
  tagName: string;
  tagColor: string;
  duration: string;
}) {
  return (
    <button
      type="button"
      className="hover:bg-state-hover flex h-8 w-full items-center gap-2 rounded px-2 text-sm transition-colors"
      onClick={fn()}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tagColor }} />
      <span className="text-foreground min-w-0 truncate">{tagName}</span>
      <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
        {duration}
      </span>
    </button>
  );
}

/** Sidebar.tsx ヘッダーと同一構造 */
function MockSidebarHeader() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-2">
      <div className="flex items-center gap-2 pl-2">
        <div className="bg-primary size-5 rounded" />
        <span className="text-foreground text-sm font-semibold tracking-tight">Dayopt</span>
      </div>
      <div className="flex items-center">
        <button
          type="button"
          className="hover:bg-state-hover flex size-8 items-center justify-center rounded"
        >
          <Search className="text-muted-foreground size-4" />
        </button>
        <button
          type="button"
          className="hover:bg-state-hover flex size-8 items-center justify-center rounded"
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
    <div className="shrink-0 py-2 pr-2 pl-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 pl-2">
          <div className="bg-primary size-6 rounded-full" />
          <span className="text-sm">Tomoya</span>
          <ChevronRight className="text-muted-foreground size-3" />
        </div>
        <button
          type="button"
          className="hover:bg-state-hover flex size-8 items-center justify-center rounded"
        >
          <span className="text-muted-foreground text-sm">🔔</span>
        </button>
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
        className="hover:bg-state-hover flex size-8 items-center justify-center rounded"
      >
        <Moon className="text-muted-foreground size-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// デバッグラッパー（256px + ガイドライン）
// ─────────────────────────────────────────────────────────

function DebugWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-surface-container border-border relative flex w-[256px] flex-col border-r"
      style={{ height: 700 }}
    >
      {/* 16pxガイドライン（赤）— ヘッダーアイコン基準 */}
      <div className="pointer-events-none absolute inset-y-0 left-4 z-50 w-px bg-red-400 opacity-40" />
      <div className="pointer-events-none absolute inset-y-0 right-2 z-50 w-px bg-red-400 opacity-40" />
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

const today = new Date();

/** サイドバー全体再現 — ヘッダー + ミニカレンダー + タグ + パレット + テーマ + フッター */
export const SidebarReproduction: Story = {
  render: () => (
    <DebugWrapper>
      {/* ヘッダー（Sidebar.tsx と同一） */}
      <MockSidebarHeader />

      {/* スクロールエリア（Sidebar.tsx content と同一） */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {/* ミニカレンダー（実コンポーネント） */}
        <div className="shrink-0">
          <MiniCalendar
            selectedDate={today}
            onDateSelect={() => {}}
            className="w-full bg-transparent"
          />
        </div>

        {/* タグセクション — CalendarFilterList と同一構造 */}
        <div className="flex min-w-0 flex-col overflow-hidden">
          <div className="w-full min-w-0 space-y-2 overflow-hidden">
            <SidebarSection title="タグ" defaultOpen className="py-1" action={<ActionButton />}>
              <TagRow name="タグ" color="var(--primary)" />
            </SidebarSection>
          </div>
        </div>

        {/* パレットセクション — Palette と同一構造 */}
        <div className="w-full min-w-0 overflow-hidden">
          <SidebarSection title="パレット" defaultOpen action={<ActionButton />}>
            <PaletteRow tagName="タグ" tagColor="var(--primary)" duration="30m" />
          </SidebarSection>
        </div>

        {/* テーマ切替 */}
        <MockThemeToggle />
      </div>

      {/* フッター */}
      <MockSidebarFooter />
    </DebugWrapper>
  ),
};

/** プリセットタグ5個のフル構成 */
export const FullSidebar: Story = {
  render: () => (
    <DebugWrapper>
      <MockSidebarHeader />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <div className="shrink-0">
          <MiniCalendar
            selectedDate={today}
            onDateSelect={() => {}}
            className="w-full bg-transparent"
          />
        </div>

        <div className="flex min-w-0 flex-col overflow-hidden">
          <div className="w-full min-w-0 space-y-2 overflow-hidden">
            <SidebarSection title="タグ" defaultOpen className="py-1" action={<ActionButton />}>
              <TagRow name="Work" color="var(--tag-blue)" />
              <TagRow name="Learning" color="var(--tag-green)" />
              <TagRow name="Life" color="var(--tag-amber)" />
              <TagRow name="Exercise" color="var(--tag-teal)" />
              <TagRow name="Hobby" color="var(--tag-violet)" />
            </SidebarSection>
          </div>
        </div>

        <div className="w-full min-w-0 overflow-hidden">
          <SidebarSection title="パレット" defaultOpen action={<ActionButton />}>
            <PaletteRow tagName="Work" tagColor="var(--tag-blue)" duration="60m" />
            <PaletteRow tagName="Exercise" tagColor="var(--tag-teal)" duration="30m" />
          </SidebarSection>
        </div>

        <MockThemeToggle />
      </div>

      <MockSidebarFooter />
    </DebugWrapper>
  ),
};
