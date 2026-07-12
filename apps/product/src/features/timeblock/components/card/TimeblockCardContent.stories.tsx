import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { CalendarEvent } from '../../types/calendar-event';

import { TimeblockCardContent } from './TimeblockCardContent';

/**
 * TimeblockCardContent — カードの内部コンテンツ。
 *
 * タグ名・時間帯を表示する。
 * TimeblockCard の内側で使われるが、独立してテスト可能な純粋コンポーネント。
 */
const meta = {
  title: 'Product/Features/Entry/CardContent',
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
      <TimeblockCardContent plan={baseEntry} tagName="仕事" timeFormat="24h" />
    </CardSlot>
  ),
};

/** タグ名なし。「タグを追加」プレースホルダーが表示される。 */
export const NoTag: Story = {
  render: () => (
    <CardSlot>
      <TimeblockCardContent plan={baseEntry} tagName={null} />
    </CardSlot>
  ),
};

/** 12h 時刻フォーマット（AM/PM）。 */
export const TimeFormat12h: Story = {
  render: () => (
    <CardSlot>
      <TimeblockCardContent plan={baseEntry} tagName="仕事" timeFormat="12h" />
    </CardSlot>
  ),
};

/** コンパクトモード（高さ < 40px）。タグ名のみ横並びで表示。 */
export const Compact: Story = {
  render: () => (
    <div className="bg-card relative h-7 w-48 overflow-hidden rounded-r-lg px-2 text-xs">
      <TimeblockCardContent plan={baseEntry} tagName="仕事" isCompact />
    </div>
  ),
};

/** プレビュー時刻（ドラッグ中の仮表示）。実際の plan の時刻ではなく previewTime が使われる。 */
export const WithPreviewTime: Story = {
  render: () => (
    <CardSlot>
      <TimeblockCardContent
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

/** 予定と記録がずれた状態。 */
export const PlannedWithActual: Story = {
  render: () => (
    <CardSlot>
      <TimeblockCardContent
        plan={{
          ...baseEntry,
          plannedStartDate: new Date('2024-01-15T10:00:00'),
          plannedEndDate: new Date('2024-01-15T11:00:00'),
          actualStartDate: new Date('2024-01-15T10:30:00'),
          actualEndDate: new Date('2024-01-15T12:15:00'),
        }}
        tagName="仕事"
        timeFormat="24h"
      />
    </CardSlot>
  ),
};

/** 時刻未設定エントリ。「時刻未設定」テキストが表示される。 */
export const NoTime: Story = {
  render: () => (
    <CardSlot>
      <TimeblockCardContent
        plan={{ ...baseEntry, startDate: null, endDate: null }}
        tagName="メモ"
        timeFormat="24h"
      />
    </CardSlot>
  ),
};

/** タグアイコンあり。タグ名の前に lucide アイコンをタグ色で表示。 */
export const WithTagIcon: Story = {
  render: () => (
    <CardSlot>
      <TimeblockCardContent
        plan={baseEntry}
        tagName="仕事"
        tagColor="blue"
        tagIcon="briefcase"
        timeFormat="24h"
      />
    </CardSlot>
  ),
};

/** タグアイコンあり・コンパクト。 */
export const WithTagIconCompact: Story = {
  render: () => (
    <div className="bg-card relative h-7 w-48 overflow-hidden rounded-r-lg px-2 text-xs">
      <TimeblockCardContent
        plan={baseEntry}
        tagName="仕事"
        tagColor="blue"
        tagIcon="briefcase"
        isCompact
      />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <section>
        <p className="text-muted-foreground mb-1 text-xs">Default（タグあり・24h）</p>
        <CardSlot>
          <TimeblockCardContent plan={baseEntry} tagName="仕事" timeFormat="24h" />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">NoTag（タグなし）</p>
        <CardSlot>
          <TimeblockCardContent plan={baseEntry} tagName={null} />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">12h フォーマット</p>
        <CardSlot>
          <TimeblockCardContent plan={baseEntry} tagName="仕事" timeFormat="12h" />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">Compact（isCompact=true）</p>
        <div className="bg-card relative h-7 w-48 overflow-hidden rounded-r-lg px-2 text-xs">
          <TimeblockCardContent plan={baseEntry} tagName="仕事" isCompact />
        </div>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">PreviewTime（ドラッグ中の仮表示）</p>
        <CardSlot>
          <TimeblockCardContent
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
        <p className="text-muted-foreground mb-1 text-xs">PlannedWithActual（予定/記録）</p>
        <CardSlot>
          <TimeblockCardContent
            plan={{
              ...baseEntry,
              plannedStartDate: new Date('2024-01-15T10:00:00'),
              plannedEndDate: new Date('2024-01-15T11:00:00'),
              actualStartDate: new Date('2024-01-15T10:30:00'),
              actualEndDate: new Date('2024-01-15T12:15:00'),
            }}
            tagName="仕事"
            timeFormat="24h"
          />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">時刻未設定</p>
        <CardSlot>
          <TimeblockCardContent
            plan={{ ...baseEntry, startDate: null, endDate: null }}
            tagName="メモ"
          />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">タグアイコンあり</p>
        <CardSlot>
          <TimeblockCardContent
            plan={baseEntry}
            tagName="仕事"
            tagColor="blue"
            tagIcon="briefcase"
            timeFormat="24h"
          />
        </CardSlot>
      </section>

      <section>
        <p className="text-muted-foreground mb-1 text-xs">タグアイコンあり・Compact</p>
        <div className="bg-card relative h-7 w-48 overflow-hidden rounded-r-lg px-2 text-xs">
          <TimeblockCardContent
            plan={baseEntry}
            tagName="仕事"
            tagColor="blue"
            tagIcon="briefcase"
            isCompact
          />
        </div>
      </section>
    </div>
  ),
};
