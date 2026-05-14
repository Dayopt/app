import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { CalendarEvent } from '../../../../types/calendar.types';
import { EventContextMenu } from './EntryContextMenu';

/** エントリコンテキストメニュー。右クリックメニューとして使用する。 */
const meta = {
  title: 'Features/Calendar/EntryContextMenu',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// サンプルデータ
// ─────────────────────────────────────────────────────────

const past = new Date('2026-03-18T10:00:00');
const pastEnd = new Date('2026-03-18T11:00:00');

/** 完了済み planned entry（全項目表示の前提） */
const completedPlannedEntry: CalendarEvent = {
  id: 'entry-1',
  title: 'デザインレビュー',
  description: '週次デザインシンク',
  startDate: past,
  endDate: pastEnd,
  status: 'closed',
  color: 'var(--primary)',
  tagId: 'tag-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  displayStartDate: past,
  displayEndDate: pastEnd,
  duration: 60,
  isMultiDay: false,
  origin: 'planned',
  actualStartDate: past,
  actualEndDate: pastEnd,
};

/** タグなし entry（振り返り非表示） */
const noTagEntry: CalendarEvent = {
  ...completedPlannedEntry,
  id: 'entry-2',
  tagId: null,
};

/** 未完了 entry（actualEnd 未確定、計画外にする非表示） */
const inProgressEntry: CalendarEvent = {
  ...completedPlannedEntry,
  id: 'entry-3',
  actualEndDate: null,
};

/** Unplanned entry（計画に戻す表示） */
const unplannedEntry: CalendarEvent = {
  ...completedPlannedEntry,
  id: 'entry-4',
  origin: 'unplanned',
};

// ─────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────

/** 右クリックでコンテキストメニューを開くラッパー。 */
function ContextMenuTrigger({
  entry,
  menuProps,
}: {
  entry: CalendarEvent;
  menuProps?: Partial<React.ComponentProps<typeof EventContextMenu>>;
}) {
  const [menuState, setMenuState] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className="border-border bg-muted relative flex h-40 w-full cursor-context-menu items-center justify-center rounded-lg border"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuState({ x: e.clientX, y: e.clientY });
      }}
    >
      <span className="text-muted-foreground text-sm">右クリックでメニューを開く</span>
      {menuState && (
        <EventContextMenu
          entry={entry}
          position={menuState}
          onClose={() => setMenuState(null)}
          {...menuProps}
        />
      )}
    </div>
  );
}

const allHandlers = {
  onDelete: fn(),
  onViewStats: fn(),
  onMarkUnplanned: fn(),
  onRestorePlanned: fn(),
};

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト（全項目あり：完了済み planned entry）。 */
export const Default: Story = {
  render: () => <ContextMenuTrigger entry={completedPlannedEntry} menuProps={allHandlers} />,
};

/** 削除のみ。 */
export const DeleteOnly: Story = {
  render: () => (
    <ContextMenuTrigger
      entry={completedPlannedEntry}
      menuProps={{
        onDelete: fn(),
      }}
    />
  ),
};

/** 直接表示（位置固定）。 */
export const DirectDisplay: Story = {
  render: () => (
    <div className="relative" style={{ height: 300 }}>
      <EventContextMenu
        entry={completedPlannedEntry}
        position={{ x: 20, y: 20 }}
        onClose={fn()}
        {...allHandlers}
      />
    </div>
  ),
};

/** 全パターン一覧（直接表示で各構成を確認）。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">完了済み planned（全項目）</span>
        <div className="relative" style={{ height: 180 }}>
          <EventContextMenu
            entry={completedPlannedEntry}
            position={{ x: 0, y: 0 }}
            onClose={fn()}
            {...allHandlers}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">タグなし（振り返り非表示）</span>
        <div className="relative" style={{ height: 140 }}>
          <EventContextMenu
            entry={noTagEntry}
            position={{ x: 0, y: 0 }}
            onClose={fn()}
            {...allHandlers}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">未完了（計画外にする非表示）</span>
        <div className="relative" style={{ height: 140 }}>
          <EventContextMenu
            entry={inProgressEntry}
            position={{ x: 0, y: 0 }}
            onClose={fn()}
            {...allHandlers}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">Unplanned（計画に戻す表示）</span>
        <div className="relative" style={{ height: 180 }}>
          <EventContextMenu
            entry={unplannedEntry}
            position={{ x: 0, y: 0 }}
            onClose={fn()}
            {...allHandlers}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">削除のみ</span>
        <div className="relative" style={{ height: 80 }}>
          <EventContextMenu
            entry={completedPlannedEntry}
            position={{ x: 0, y: 0 }}
            onClose={fn()}
            onDelete={fn()}
          />
        </div>
      </div>
    </div>
  ),
};
