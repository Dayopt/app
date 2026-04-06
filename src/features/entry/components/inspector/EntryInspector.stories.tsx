import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Calendar, Clock, Play, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { expect, within } from 'storybook/test';

import type { ReactNode } from 'react';

import type { FulfillmentScore } from '../../types/entry';

// Story 内のみ: Composition Layer 連携プレビュー用
// eslint-disable-next-line no-restricted-imports
import { EntryMicroInsight } from '@/features/stats/components/shared/EntryMicroInsight';

import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Spinner } from '@/components/ui/spinner';
import { DateRow, FulfillmentRow, NoteSection, TimeDiffBlock, TimeRow } from './fields';
import { InspectorFrame, MockReminderRow, MockTagRow } from './story-helpers';

/**
 * Entry Inspector — 統一エントリモデルの表示確認
 *
 * entries統合後の Inspector 完成形。
 * 全エントリは `origin: planned` で統一。
 * `entryState` は表示状態の判定（upcoming/active/past）に使用。
 *
 * - 予定行: 常に編集可能 | 記録行: 編集可能
 * - プログレスバー: ○ | 繰り返し/通知: ○ | 充実度: ○ | メモ: ○
 */
const meta = {
  title: 'Features/Entry/Inspector/EntryInspector',
  parameters: {
    layout: 'centered',
    // button-name: internal inspector icon buttons
    a11y: { test: 'todo' },
  },
  tags: ['autodocs', 'critical'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Shared content — fields/ コンポーネントでフラット描画
// ─────────────────────────────────────────────────────────

interface InspectorContentProps {
  tagName?: string;
  tagColor?: string | null;
  initialPlannedStart?: string;
  initialPlannedEnd?: string;
  initialActualStart?: string | null;
  initialActualEnd?: string | null;
  initialNote?: string;
  initialFulfillment?: FulfillmentScore | null;
  /** Composition Layer から注入されるマイクロインサイト（ReactNode） */
  microInsight?: ReactNode;
}

function InspectorContent({
  tagName,
  tagColor,
  initialPlannedStart = '10:00',
  initialPlannedEnd = '11:30',
  initialActualStart = null,
  initialActualEnd = null,
  initialNote = '',
  initialFulfillment = null,
  microInsight,
}: InspectorContentProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [plannedStart, setPlannedStart] = useState(initialPlannedStart);
  const [plannedEnd, setPlannedEnd] = useState(initialPlannedEnd);
  const [actualStart, setActualStart] = useState<string | null>(initialActualStart);
  const [actualEnd, setActualEnd] = useState<string | null>(initialActualEnd);
  const [note, setNote] = useState(initialNote);
  const [fulfillment, setFulfillment] = useState<FulfillmentScore | null>(initialFulfillment);
  const t = useTranslations();

  const effectiveActualStart = actualStart ?? plannedStart;
  const effectiveActualEnd = actualEnd ?? plannedEnd;

  return (
    <div className="px-4 pt-2 pb-4 md:px-6 md:pt-4 md:pb-6">
      {/* Tag + Delete */}
      <MockTagRow tagName={tagName} tagColor={tagColor} />

      {/* Micro Insight (Composition Layer 経由で注入) */}
      {microInsight && <div className="mt-2 px-1">{microInsight}</div>}

      {/* Schedule card */}
      <div className="bg-muted mt-4 rounded-2xl">
        <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
          {/* Date */}
          <DateRow
            label={t('entry.inspector.time.date')}
            icon={Calendar}
            selectedDate={date}
            onDateChange={setDate}
          />

          {/* Planned time */}
          <TimeRow
            label={t('entry.inspector.time.planned')}
            icon={Clock}
            startTime={plannedStart}
            endTime={plannedEnd}
            onStartChange={setPlannedStart}
            onEndChange={setPlannedEnd}
          />

          {/* Actual time */}
          <TimeRow
            label={t('entry.inspector.time.actual')}
            icon={Play}
            startTime={effectiveActualStart}
            endTime={effectiveActualEnd}
            onStartChange={(time) => setActualStart(time)}
            onEndChange={(time) => setActualEnd(time)}
            isPrimary
          />

          {/* 予定 vs 記録 差分バー */}
          <TimeDiffBlock
            plannedStart={plannedStart}
            plannedEnd={plannedEnd}
            actualStart={actualStart}
            actualEnd={actualEnd}
            tagColor={tagColor}
          />

          {/* Fulfillment */}
          <FulfillmentRow
            label={t('entry.inspector.time.fulfillment')}
            score={fulfillment}
            onScoreChange={setFulfillment}
            scoreLabels={{
              low: t('entry.inspector.time.fulfillmentLow'),
              medium: t('entry.inspector.time.fulfillmentMedium'),
              high: t('entry.inspector.time.fulfillmentHigh'),
            }}
          />

          {/* Reminder */}
          <MockReminderRow />

          {/* Note */}
          <NoteSection
            label={t('entry.inspector.note.label')}
            icon={StickyNote}
            note={note}
            onNoteChange={setNote}
            placeholder={t('entry.inspector.note.placeholder')}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * ## Upcoming + Planned
 *
 * 未来の予定エントリ。計画の編集がメイン操作。
 * - 予定行: 編集可能 | 記録行: 編集可能（予定と同じ初期値）
 * - プログレスバー: ○ | 繰り返し/通知: ○ | 充実度: ○ | メモ: ○
 */
export const UpcomingPlanned: Story = {
  render: () => (
    <InspectorFrame>
      <InspectorContent
        tagName="Work"
        tagColor="blue"
        initialPlannedStart="14:00"
        initialPlannedEnd="15:30"
        initialNote="Prepare slides for the meeting"
      />
    </InspectorFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const noteTextarea = canvas.getByPlaceholderText('メモを追加...');
    await expect(noteTextarea).toBeInTheDocument();
    await expect(noteTextarea).toHaveValue('Prepare slides for the meeting');
  },
};

/**
 * ## Past + Planned
 *
 * 完了した予定エントリ。振り返りがメイン操作。
 * - 予定行: 編集可 | 記録行: 編集可
 * - 差分: バッジ表示 | 繰り返し/通知: ○ | 充実度: ○ | メモ: ○
 */
export const PastPlanned: Story = {
  render: () => (
    <InspectorFrame>
      <InspectorContent
        tagName="Meeting"
        tagColor="purple"
        initialPlannedStart="10:00"
        initialPlannedEnd="11:30"
        initialActualStart="10:15"
        initialActualEnd="12:00"
        initialNote="Ran over by 30 minutes"
        initialFulfillment={2}
      />
    </InspectorFrame>
  ),
};

// ─────────────────────────────────────────────────────────
// With Micro Insight（Composition Layer 連携プレビュー）
// ─────────────────────────────────────────────────────────

/**
 * ## MicroInsight 付き — 見積もり超過バイアス
 *
 * Composition Layer が stats feature の `getEntryMicroInsight()` を呼び、
 * 結果を ReactNode として Inspector に注入するパターン。
 * ここでは Story 内で直接モックテキストを渡している。
 */
export const WithMicroInsightEstimation: Story = {
  render: () => (
    <InspectorFrame>
      <InspectorContent
        tagName="Meeting"
        tagColor="purple"
        initialPlannedStart="10:00"
        initialPlannedEnd="11:30"
        microInsight={
          <EntryMicroInsight
            insight={{
              type: 'estimation_bias',
              messageKey: 'estimationBiasOver',
              messageParams: { bias: 25 },
            }}
          />
        }
      />
    </InspectorFrame>
  ),
};

/** MicroInsight 付き — 時間帯の充実度 */
export const WithMicroInsightFulfillment: Story = {
  render: () => (
    <InspectorFrame>
      <InspectorContent
        tagName="Work"
        tagColor="blue"
        initialPlannedStart="10:00"
        initialPlannedEnd="12:00"
        initialActualStart="10:00"
        initialActualEnd="12:15"
        initialFulfillment={3}
        microInsight={
          <EntryMicroInsight
            insight={{
              type: 'hourly_fulfillment',
              messageKey: 'hourlyFulfillmentHigh',
            }}
          />
        }
      />
    </InspectorFrame>
  ),
};

/** MicroInsight なし（null — 大半のケース）。既存と同じ見た目。 */
export const WithoutMicroInsight: Story = {
  render: () => (
    <InspectorFrame>
      <InspectorContent
        tagName="Work"
        tagColor="blue"
        initialPlannedStart="14:00"
        initialPlannedEnd="15:30"
        microInsight={undefined}
      />
    </InspectorFrame>
  ),
};

// ─────────────────────────────────────────────────────────
// Loading / Empty / Mobile states
// ─────────────────────────────────────────────────────────

/**
 * ## Loading
 *
 * エントリデータ取得中のスピナー表示。
 * 実コンポーネントの `isLoading === true` 分岐と同一マークアップ。
 */
export const Loading: Story = {
  render: () => (
    <InspectorFrame>
      <div className="flex h-full flex-1 items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    </InspectorFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toBeInTheDocument();
  },
};

/**
 * ## NotFound
 *
 * 指定 entryId のエントリが存在しない場合の空状態表示。
 * 実コンポーネントの `!entry` 分岐と同一マークアップ。
 */
export const NotFound: Story = {
  render: function NotFoundStory() {
    const t = useTranslations();
    return (
      <InspectorFrame>
        <div className="flex h-full flex-1 items-center justify-center py-16">
          <p className="text-muted-foreground">{t('entry.inspector.notFound')}</p>
        </div>
      </InspectorFrame>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('プランが見つかりません')).toBeInTheDocument();
  },
};

/**
 * ## MobileDrawer
 *
 * モバイル幅での Drawer レイアウト確認。
 * 実コンポーネントの `isMobile === true` 分岐と同一構造:
 * - ドラッグハンドル（灰色バー）
 * - スクロール可能なコンテンツ領域
 */
export const MobileDrawer: Story = {
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  render: function MobileDrawerStory() {
    const [open, setOpen] = useState(true);
    const snapPoints = [1] as const;
    const [snap, setSnap] = useState<number | string | null>(snapPoints[0]);

    return (
      <Drawer
        open={open}
        onOpenChange={(next) => !next && setOpen(false)}
        snapPoints={snapPoints as unknown as (number | string)[]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        fadeFromIndex={1}
      >
        <DrawerContent className="bg-card z-modal flex flex-col gap-0 overflow-hidden rounded-t-none p-0">
          <DrawerTitle className="sr-only">エントリ詳細</DrawerTitle>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <InspectorContent
              tagName="Work"
              tagColor="blue"
              initialPlannedStart="10:00"
              initialPlannedEnd="11:30"
              initialNote="モバイル Drawer 表示の確認"
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  },
};

/**
 * 全パターンを横並びで比較確認。
 * Loading・NotFound・通常表示の 3 状態を一覧。
 */
export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    const t = useTranslations();
    return (
      <div className="flex flex-wrap items-start gap-6">
        <div>
          <p className="text-muted-foreground mb-2 text-center text-xs">Upcoming + Planned</p>
          <InspectorFrame>
            <InspectorContent
              tagName="Work"
              tagColor="blue"
              initialPlannedStart="14:00"
              initialPlannedEnd="15:30"
              initialNote="Prepare slides"
            />
          </InspectorFrame>
        </div>
        <div>
          <p className="text-muted-foreground mb-2 text-center text-xs">Past + Planned</p>
          <InspectorFrame>
            <InspectorContent
              tagName="Meeting"
              tagColor="purple"
              initialPlannedStart="10:00"
              initialPlannedEnd="11:30"
              initialActualStart="10:15"
              initialActualEnd="12:00"
              initialNote="Ran 30min over"
              initialFulfillment={2}
            />
          </InspectorFrame>
        </div>
        <div>
          <p className="text-muted-foreground mb-2 text-center text-xs">Loading</p>
          <InspectorFrame>
            <div className="flex h-full flex-1 items-center justify-center py-16">
              <Spinner size="lg" />
            </div>
          </InspectorFrame>
        </div>
        <div>
          <p className="text-muted-foreground mb-2 text-center text-xs">Not Found</p>
          <InspectorFrame>
            <div className="flex h-full flex-1 items-center justify-center py-16">
              <p className="text-muted-foreground">{t('entry.inspector.notFound')}</p>
            </div>
          </InspectorFrame>
        </div>
      </div>
    );
  },
};
