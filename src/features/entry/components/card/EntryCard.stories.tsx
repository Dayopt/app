import type { Meta, StoryObj } from '@storybook/react-vite';

import type { CalendarEvent } from '@/types/calendar-event';

import { EntryCard } from './EntryCard';

/** エントリーカード。カレンダーグリッド上の表示ブロック。タグカラー・状態・origin によるバリエーション。 */
const meta = {
  title: 'Features/Entry/EntryCard',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** EntryCardはposition:absoluteのため、relativeな親が必要。 */
function Slot({ children, height = 72 }: { children: React.ReactNode; height?: number }) {
  return (
    <div className="relative w-full" style={{ height }}>
      {children}
    </div>
  );
}

const baseEntry: CalendarEvent = {
  id: 'entry-1',
  title: 'チームミーティング',
  description: '週次の進捗確認',
  startDate: new Date('2024-01-15T10:00:00'),
  endDate: new Date('2024-01-15T11:00:00'),
  status: 'open',
  color: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  displayStartDate: new Date('2024-01-15T10:00:00'),
  displayEndDate: new Date('2024-01-15T11:00:00'),
  duration: 60,
  isMultiDay: false,
  isRecurring: false,
};

const basePosition = {
  top: 0,
  left: 0,
  width: 100,
  height: 72,
};

// ---------------------------------------------------------------------------
// Draft（未保存プレビュー）
// ---------------------------------------------------------------------------

/** Inspector表示後のドラフト。ドラッグ不可。 */
export const Draft: Story = {
  render: () => (
    <Slot>
      <EntryCard
        entry={{ ...baseEntry, id: '__draft__', title: '', isDraft: true }}
        position={basePosition}
      />
    </Slot>
  ),
};

// ---------------------------------------------------------------------------
// エントリ状態（entryState）
// ---------------------------------------------------------------------------

/** 過去エントリ。左アクセントは斜線パターン、ドラッグ・リサイズ不可。 */
export const PastEntry: Story = {
  render: () => (
    <Slot>
      <EntryCard entry={{ ...baseEntry, entryState: 'past' }} position={basePosition} />
    </Slot>
  ),
};

/** アクティブ（実行中）エントリ。 */
export const ActiveEntry: Story = {
  render: () => (
    <Slot>
      <EntryCard entry={{ ...baseEntry, entryState: 'active' }} position={basePosition} />
    </Slot>
  ),
};

// ---------------------------------------------------------------------------
// オリジン（origin）
// ---------------------------------------------------------------------------

/** Unplanned エントリ。左アクセントが点線パターンで表示される。 */
export const UnplannedEntry: Story = {
  render: () => (
    <Slot>
      <EntryCard entry={{ ...baseEntry, origin: 'planned' }} position={basePosition} />
    </Slot>
  ),
};

// ---------------------------------------------------------------------------
// 予定 vs 記録の差分オーバーレイ
// ---------------------------------------------------------------------------

/** 未実行オーバーレイ。予定時間に対して実績が短かった区間に斜線ハッチング。 */
export const OverlayUnexecuted: Story = {
  render: () => (
    <Slot height={144}>
      <EntryCard
        entry={{
          ...baseEntry,
          entryState: 'past',
          origin: 'planned',
          endDate: new Date('2024-01-15T12:00:00'),
          displayEndDate: new Date('2024-01-15T12:00:00'),
          duration: 120,
          actualStartDate: new Date('2024-01-15T10:30:00'),
          actualEndDate: new Date('2024-01-15T11:30:00'),
        }}
        position={{ ...basePosition, height: 144 }}
        hourHeight={72}
      />
    </Slot>
  ),
};

/** 超過オーバーレイ。予定時間を超えて実施した区間に左アクセント点線 + カード拡張。 */
export const OverlayOvertime: Story = {
  render: () => (
    <Slot height={180}>
      <EntryCard
        entry={{
          ...baseEntry,
          entryState: 'past',
          origin: 'planned',
          endDate: new Date('2024-01-15T11:00:00'),
          displayEndDate: new Date('2024-01-15T11:00:00'),
          duration: 60,
          actualStartDate: new Date('2024-01-15T09:30:00'),
          actualEndDate: new Date('2024-01-15T11:30:00'),
        }}
        position={{ ...basePosition, height: 72 }}
        hourHeight={72}
      />
    </Slot>
  ),
};

// ---------------------------------------------------------------------------
// 状態バリエーション
// ---------------------------------------------------------------------------

/** リマインダー設定あり。ベルアイコンが表示される。 */
export const WithReminder: Story = {
  render: () => (
    <Slot>
      <EntryCard entry={{ ...baseEntry, reminder_minutes: 15 }} position={basePosition} />
    </Slot>
  ),
};

// ---------------------------------------------------------------------------
// サイズバリエーション
// ---------------------------------------------------------------------------

/** 時間帯による高さの違い（HOUR_HEIGHT=72pxベース）。 */
export const SizeVariations: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Slot height={18}>
        <EntryCard entry={baseEntry} position={{ ...basePosition, height: 18 }} />
      </Slot>
      <Slot height={36}>
        <EntryCard entry={baseEntry} position={{ ...basePosition, height: 36 }} />
      </Slot>
      <Slot>
        <EntryCard entry={baseEntry} position={basePosition} />
      </Slot>
      <Slot height={144}>
        <EntryCard entry={baseEntry} position={{ ...basePosition, height: 144 }} />
      </Slot>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 全パターン一覧
// ---------------------------------------------------------------------------

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  // color-contrast: text-foreground/60 on plan card background
  parameters: { a11y: { test: 'todo' } },
  render: () => (
    <div className="flex flex-col gap-8">
      {/* --- 表示モード --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">Draft（未保存プレビュー）</p>
        <Slot>
          <EntryCard
            entry={{ ...baseEntry, id: '__draft__', title: '', isDraft: true }}
            position={basePosition}
          />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">Past（過去エントリ）</p>
        <Slot>
          <EntryCard entry={{ ...baseEntry, entryState: 'past' }} position={basePosition} />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">Active（実行中）</p>
        <Slot>
          <EntryCard entry={{ ...baseEntry, entryState: 'active' }} position={basePosition} />
        </Slot>
      </section>

      {/* --- Origin --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">Unplanned（左アクセント点線）</p>
        <Slot>
          <EntryCard entry={{ ...baseEntry, origin: 'planned' }} position={basePosition} />
        </Slot>
      </section>

      {/* --- 状態バリエーション --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">Reminder（ベルアイコン）</p>
        <Slot>
          <EntryCard entry={{ ...baseEntry, reminder_minutes: 15 }} position={basePosition} />
        </Slot>
      </section>

      {/* --- 予定 vs 記録 差分オーバーレイ --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">
          Overlay: Unexecuted（予定より実績が短い → 斜線ハッチング）
        </p>
        <Slot height={144}>
          <EntryCard
            entry={{
              ...baseEntry,
              entryState: 'past',
              origin: 'planned',
              endDate: new Date('2024-01-15T12:00:00'),
              displayEndDate: new Date('2024-01-15T12:00:00'),
              duration: 120,
              actualStartDate: new Date('2024-01-15T10:30:00'),
              actualEndDate: new Date('2024-01-15T11:30:00'),
            }}
            position={{ ...basePosition, height: 144 }}
            hourHeight={72}
          />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">
          Overlay: Overtime（予定より実績が長い → 点線ボーダー拡張）
        </p>
        <Slot height={180}>
          <EntryCard
            entry={{
              ...baseEntry,
              entryState: 'past',
              origin: 'planned',
              endDate: new Date('2024-01-15T11:00:00'),
              displayEndDate: new Date('2024-01-15T11:00:00'),
              duration: 60,
              actualStartDate: new Date('2024-01-15T09:30:00'),
              actualEndDate: new Date('2024-01-15T11:30:00'),
            }}
            position={{ ...basePosition, height: 72 }}
            hourHeight={72}
          />
        </Slot>
      </section>

      {/* --- サイズバリエーション --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">15min（最小・1行）</p>
        <Slot height={18}>
          <EntryCard entry={baseEntry} position={{ ...basePosition, height: 18 }} />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">30min（コンパクト）</p>
        <Slot height={36}>
          <EntryCard entry={baseEntry} position={{ ...basePosition, height: 36 }} />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">60min（通常）</p>
        <Slot>
          <EntryCard entry={baseEntry} position={basePosition} />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">120min（長時間）</p>
        <Slot height={144}>
          <EntryCard entry={baseEntry} position={{ ...basePosition, height: 144 }} />
        </Slot>
      </section>
    </div>
  ),
};
