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

const sampleEntry: CalendarEvent = {
  id: 'entry-1',
  title: 'デザインレビュー',
  description: '週次デザインシンク',
  startDate: new Date('2026-03-18T10:00:00'),
  endDate: new Date('2026-03-18T11:00:00'),
  status: 'open',
  color: 'var(--primary)',
  createdAt: new Date(),
  updatedAt: new Date(),
  displayStartDate: new Date('2026-03-18T10:00:00'),
  displayEndDate: new Date('2026-03-18T11:00:00'),
  duration: 60,
  isMultiDay: false,

  origin: 'planned',
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

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 削除アクション。 */
export const DeleteOnly: Story = {
  render: () => (
    <ContextMenuTrigger
      entry={sampleEntry}
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
        entry={sampleEntry}
        position={{ x: 20, y: 20 }}
        onClose={fn()}
        onDelete={fn()}
      />
    </div>
  ),
};

/** 全パターン一覧（直接表示で各構成を確認）。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">削除</span>
        <div className="relative" style={{ height: 80 }}>
          <EventContextMenu
            entry={sampleEntry}
            position={{ x: 0, y: 0 }}
            onClose={fn()}
            onDelete={fn()}
          />
        </div>
      </div>
    </div>
  ),
};
