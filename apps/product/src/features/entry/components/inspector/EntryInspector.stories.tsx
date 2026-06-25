import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Calendar, Clock, Play, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { expect, within } from 'storybook/test';

import type { ReactNode } from 'react';

// Story 内のみ: Composition Layer 連携プレビュー用
import { EntryMicroInsight } from '@/features/review';

import { Drawer, DrawerContent, DrawerTitle, Spinner } from '@dayopt/components';
import { DateRow, NoteSection, TimeDiffBlock, TimeRow } from './fields';
import { InspectorFrame, MockTagRow } from './story-helpers';

/**
 * Entry Inspector — 統一エントリモデルの表示確認
 *
 * 記録の有無・差分パターン別にStoriesを分類。
 * TimeDiffBlock の差分バーは記録入力時のみ表示。
 */
const meta = {
  title: 'Product/Features/Entry/Inspector/EntryInspector',
  parameters: {
    layout: 'centered',
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
  microInsight?: ReactNode;
  /** 予定外エントリ */
  isUnplanned?: boolean;
}

function InspectorContent({
  tagName,
  tagColor,
  initialPlannedStart = '10:00',
  initialPlannedEnd = '11:30',
  initialActualStart = '10:00',
  initialActualEnd = '11:30',
  initialNote = '',
  microInsight,
  isUnplanned = false,
}: InspectorContentProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [plannedStart, setPlannedStart] = useState(initialPlannedStart);
  const [plannedEnd, setPlannedEnd] = useState(initialPlannedEnd);
  const [actualStart, setActualStart] = useState<string | null>(initialActualStart);
  const [actualEnd, setActualEnd] = useState<string | null>(initialActualEnd);
  const [note, setNote] = useState(initialNote);
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
            disabled={isUnplanned}
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
            isUnplanned={isUnplanned}
          />

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
// 1. Default（ぴったり）
// ─────────────────────────────────────────────────────────

/** 基本形: 予定通り。差分バー ±0。 */
export const Default: Story = {
  render: () => (
    <InspectorFrame>
      <InspectorContent
        tagName="Meeting"
        tagColor="green"
        initialPlannedStart="10:00"
        initialPlannedEnd="11:00"
        initialActualStart="10:00"
        initialActualEnd="11:00"
      />
    </InspectorFrame>
  ),
};

// ─────────────────────────────────────────────────────────
// 2. 超過
// ─────────────────────────────────────────────────────────

/** 超過: 遅れて始めて遅く終わった。差分バー +15m。 */
export const Overtime: Story = {
  render: () => (
    <InspectorFrame>
      <InspectorContent
        tagName="Meeting"
        tagColor="violet"
        initialPlannedStart="10:00"
        initialPlannedEnd="11:30"
        initialActualStart="10:15"
        initialActualEnd="12:00"
        initialNote="30分延長した"
      />
    </InspectorFrame>
  ),
};

// ─────────────────────────────────────────────────────────
// 3. 不足
// ─────────────────────────────────────────────────────────

/** 不足: 予定より短く終わった。差分バー -30m。 */
export const Underrun: Story = {
  render: () => (
    <InspectorFrame>
      <InspectorContent
        tagName="勉強"
        tagColor="amber"
        initialPlannedStart="14:00"
        initialPlannedEnd="16:00"
        initialActualStart="14:00"
        initialActualEnd="15:30"
      />
    </InspectorFrame>
  ),
};

// ─────────────────────────────────────────────────────────
// 4. 計画外
// ─────────────────────────────────────────────────────────

/** 予定外: origin='unplanned'。予定行disabled + 全点線バー。 */
export const Unplanned: Story = {
  render: () => (
    <InspectorFrame>
      <InspectorContent
        tagName="割り込み対応"
        tagColor="red"
        initialPlannedStart="10:00"
        initialPlannedEnd="11:30"
        initialActualStart="10:00"
        initialActualEnd="11:30"
        isUnplanned
      />
    </InspectorFrame>
  ),
};

// ─────────────────────────────────────────────────────────
// 5. MicroInsight 連携
// ─────────────────────────────────────────────────────────

/** MicroInsight 付き — 見積もり超過バイアス */
export const WithMicroInsightEstimation: Story = {
  render: () => (
    <InspectorFrame>
      <InspectorContent
        tagName="Meeting"
        tagColor="violet"
        initialPlannedStart="10:00"
        initialPlannedEnd="11:30"
        initialActualStart="10:00"
        initialActualEnd="12:00"
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

// ─────────────────────────────────────────────────────────
// 6. Loading / Empty / Mobile
// ─────────────────────────────────────────────────────────

/** Loading: データ取得中のスピナー表示。 */
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

/** NotFound: エントリが存在しない場合。 */
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

/** MobileDrawer: モバイル幅での Drawer レイアウト確認。 */
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
        <DrawerContent className="flex flex-col gap-0 overflow-hidden p-0">
          <DrawerTitle className="sr-only">エントリ詳細</DrawerTitle>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <InspectorContent
              tagName="Deep Work"
              tagColor="blue"
              initialPlannedStart="10:00"
              initialPlannedEnd="11:30"
              initialActualStart="10:00"
              initialActualEnd="11:45"
              initialNote="モバイル Drawer 表示の確認"
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  },
};

// ─────────────────────────────────────────────────────────
// 7. 全パターン一覧
// ─────────────────────────────────────────────────────────

/** 全パターンを横並びで比較確認。 */
export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    const t = useTranslations();
    return (
      <div className="flex flex-wrap items-start gap-6">
        <div>
          <p className="text-muted-foreground mb-2 text-center text-xs">ぴったり</p>
          <InspectorFrame>
            <InspectorContent
              tagName="Meeting"
              tagColor="green"
              initialPlannedStart="10:00"
              initialPlannedEnd="11:00"
              initialActualStart="10:00"
              initialActualEnd="11:00"
            />
          </InspectorFrame>
        </div>
        <div>
          <p className="text-muted-foreground mb-2 text-center text-xs">超過（+30m）</p>
          <InspectorFrame>
            <InspectorContent
              tagName="Meeting"
              tagColor="violet"
              initialPlannedStart="10:00"
              initialPlannedEnd="11:30"
              initialActualStart="10:15"
              initialActualEnd="12:00"
            />
          </InspectorFrame>
        </div>
        <div>
          <p className="text-muted-foreground mb-2 text-center text-xs">不足（-30m）</p>
          <InspectorFrame>
            <InspectorContent
              tagName="勉強"
              tagColor="amber"
              initialPlannedStart="14:00"
              initialPlannedEnd="16:00"
              initialActualStart="14:00"
              initialActualEnd="15:30"
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
