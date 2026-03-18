import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { CalendarEvent } from '@/types/calendar-event';

import { EntryCardContent } from './EntryCardContent';

/**
 * EntryCardContent — カードの内部コンテンツ。
 *
 * タグ名・時間帯・繰り返しアイコン・リマインダーアイコンを表示する。
 * EntryCard の内側で使われるが、独立してテスト可能な純粋コンポーネント。
 */
const meta = {
  title: 'Features/Entry/EntryCardContent',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

const baseEntry: CalendarEvent = {
  id: 'entry-1',
  title: 'チームミーティング',
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

/** カード幅を固定するラッパー */
function CardSlot({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card relative h-16 w-48 overflow-hidden rounded-r-lg p-2 text-sm">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** タグ名あり・24h時刻表示（標準）。 */
export const Default: Story = {
  render: () => (
    <CardSlot>
      <EntryCardContent plan={baseEntry} tagName="仕事" timeFormat="24h" />
    </CardSlot>
  ),
};

/** タグ名なし。「タグを追加」プレースホルダーが表示される。 */
export const NoTag: Story = {
  render: () => (
    <CardSlot>
      <EntryCardContent plan={baseEntry} tagName={null} />
    </CardSlot>
  ),
};

/** 12h 時刻フォーマット（AM/PM）。 */
export const TimeFormat12h: Story = {
  render: () => (
    <CardSlot>
      <EntryCardContent plan={baseEntry} tagName="仕事" timeFormat="12h" />
    </CardSlot>
  ),
};

/** コンパクトモード（高さ < 40px）。タグ名のみ横並びで表示。 */
export const Compact: Story = {
  render: () => (
    <div className="bg-card relative h-7 w-48 overflow-hidden rounded-r-lg px-2 text-xs">
      <EntryCardContent plan={baseEntry} tagName="仕事" isCompact />
    </div>
  ),
};

/** 繰り返しエントリ。Repeat アイコンが時刻の後ろに表示される。 */
export const Recurring: Story = {
  render: () => (
    <CardSlot>
      <EntryCardContent
        plan={{ ...baseEntry, isRecurring: true }}
        tagName="朝会"
        timeFormat="24h"
      />
    </CardSlot>
  ),
};

/** リマインダー設定あり。Bell アイコンが表示される。 */
export const WithReminder: Story = {
  render: () => (
    <CardSlot>
      <EntryCardContent
        plan={{ ...baseEntry, reminder_minutes: 15 }}
        tagName="締め切り確認"
        timeFormat="24h"
      />
    </CardSlot>
  ),
};

/** 繰り返し + リマインダーの両方。 */
export const RecurringWithReminder: Story = {
  render: () => (
    <CardSlot>
      <EntryCardContent
        plan={{ ...baseEntry, isRecurring: true, reminder_minutes: 10 }}
        tagName="週次レビュー"
        timeFormat="24h"
      />
    </CardSlot>
  ),
};

/** プレビュー時刻（ドラッグ中の仮表示）。実際の plan の時刻ではなく previewTime が使われる。 */
export const WithPreviewTime: Story = {
  render: () => (
    <CardSlot>
      <EntryCardContent
        plan={baseEntry}
        tagName="仕事"
        timeFormat="24h"
        previewTime={{
          start: new Date('2024-01-15T14:30:00'),
          end: new Date('2024-01-15T15:30:00'),
        }}
      />
    </CardSlot>
  ),
};

/** 時刻未設定エントリ。「時刻未設定」テキストが表示される。 */
export const NoTime: Story = {
  render: () => (
    <CardSlot>
      <EntryCardContent
        plan={{ ...baseEntry, startDate: null, endDate: null }}
        tagName="メモ"
        timeFormat="24h"
      />
    </CardSlot>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <section>
        <p className="text-muted-foreground mb-1 text-xs">Default（タグあり・24h）</p>
        <CardSlot>
          <EntryCardContent plan={baseEntry} tagName="仕事" timeFormat="24h" />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">NoTag（タグなし）</p>
        <CardSlot>
          <EntryCardContent plan={baseEntry} tagName={null} />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">12h フォーマット</p>
        <CardSlot>
          <EntryCardContent plan={baseEntry} tagName="仕事" timeFormat="12h" />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">Compact（isCompact=true）</p>
        <div className="bg-card relative h-7 w-48 overflow-hidden rounded-r-lg px-2 text-xs">
          <EntryCardContent plan={baseEntry} tagName="仕事" isCompact />
        </div>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">Recurring（繰り返しアイコン）</p>
        <CardSlot>
          <EntryCardContent plan={{ ...baseEntry, isRecurring: true }} tagName="朝会" />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">WithReminder（ベルアイコン）</p>
        <CardSlot>
          <EntryCardContent plan={{ ...baseEntry, reminder_minutes: 15 }} tagName="締め切り確認" />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">繰り返し + リマインダー</p>
        <CardSlot>
          <EntryCardContent
            plan={{ ...baseEntry, isRecurring: true, reminder_minutes: 10 }}
            tagName="週次レビュー"
          />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">PreviewTime（ドラッグ中の仮表示）</p>
        <CardSlot>
          <EntryCardContent
            plan={baseEntry}
            tagName="仕事"
            timeFormat="24h"
            previewTime={{
              start: new Date('2024-01-15T14:30:00'),
              end: new Date('2024-01-15T15:30:00'),
            }}
          />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">時刻未設定</p>
        <CardSlot>
          <EntryCardContent
            plan={{ ...baseEntry, startDate: null, endDate: null }}
            tagName="メモ"
          />
        </CardSlot>
      </section>
    </div>
  ),
};
