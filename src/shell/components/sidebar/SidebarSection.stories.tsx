import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ChevronRight, Moon, PanelLeft, Plus, Search } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { MiniCalendar } from '@/components/ui/mini-calendar';

import { BlockItem } from './BlockItem';
import { SidebarSection } from './SidebarSection';

/** SidebarSection — サイドバー余白デバッグ */
const meta = {
  title: 'Components/Shell/SidebarSection',
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
// モックパーツ（tRPC/Store依存のため実コンポーネント使用不可）
// ─────────────────────────────────────────────────────────

/** CreateTagButton と同一構造: size-8, ghost */
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

/**
 * FilterItem (TagFlatList内) と同一構造
 * 実物: src/features/calendar/components/tag-filter/components/FilterItem/FilterItem.tsx
 * - group/item hover:bg-state-hover flex h-8 w-full min-w-0 items-center rounded text-sm
 * - Checkbox: ml-2 shrink-0
 * - Label: ml-1 min-w-0 flex-1 truncate
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
  return (
    <div className="hover:bg-state-hover group/item flex h-8 w-full min-w-0 cursor-pointer items-center rounded text-sm">
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
        <div className="flex items-center gap-2">
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

/** SidebarUtilities と同一構造（px-2なし — Sidebar scroll area が提供） */
function MockThemeToggle() {
  return (
    <div className="flex items-center gap-1 py-2">
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
      {/* 8px ガイドライン（青）— ホバー背景の開始位置 */}
      <div className="pointer-events-none absolute inset-y-0 left-2 z-50 w-px bg-blue-400 opacity-40" />
      <div className="pointer-events-none absolute inset-y-0 right-2 z-50 w-px bg-blue-400 opacity-40" />
      {/* 16px ガイドライン（赤）— テキスト/コンテンツの開始位置 */}
      <div className="pointer-events-none absolute inset-y-0 left-4 z-50 w-px bg-red-400 opacity-40" />
      <div className="pointer-events-none absolute inset-y-0 right-4 z-50 w-px bg-red-400 opacity-40" />
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

const today = new Date();
const noop = fn();

/** サイドバー全体再現 — ヘッダー + ミニカレンダー + タグ + パレット + テーマ + フッター */
export const SidebarReproduction: Story = {
  render: () => (
    <DebugWrapper>
      <MockSidebarHeader />

      {/* Sidebar.tsx scroll area と同一: px-2 が全コンテンツの外枠 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-2">
        <div className="shrink-0">
          <MiniCalendar
            selectedDate={today}
            onDateSelect={() => {}}
            className="w-full bg-transparent"
          />
        </div>

        {/* CalendarFilterList と同一構造 */}
        <div className="flex min-w-0 flex-col overflow-hidden">
          <div className="w-full min-w-0 space-y-2 overflow-hidden">
            <SidebarSection title="タグ" defaultOpen className="py-1" action={<ActionButton />}>
              <TagRow name="タグ" color="var(--primary)" />
            </SidebarSection>
          </div>
        </div>

        {/* Palette と同一構造 — 実BlockItem使用 */}
        <div className="w-full min-w-0 overflow-hidden">
          <SidebarSection title="パレット" defaultOpen action={<ActionButton />}>
            <BlockItem tagName="タグ" tagColor="blue" durationMinutes={30} onClick={noop} />
          </SidebarSection>
        </div>

        <MockThemeToggle />
      </div>

      <MockSidebarFooter />
    </DebugWrapper>
  ),
};

/** プリセットタグ5個のフル構成 */
export const FullSidebar: Story = {
  render: () => (
    <DebugWrapper>
      <MockSidebarHeader />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-2">
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
            <BlockItem tagName="Work" tagColor="blue" durationMinutes={60} onClick={noop} />
            <BlockItem tagName="Exercise" tagColor="teal" durationMinutes={30} onClick={noop} />
          </SidebarSection>
        </div>

        <MockThemeToggle />
      </div>

      <MockSidebarFooter />
    </DebugWrapper>
  ),
};
