import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { EntryCard } from '@/features/entry';
import type { CalendarEvent } from '../../../../types/calendar.types';
import { DragSelectionPreview } from './CalendarDragSelection/DragSelectionPreview';

/**
 * DnD（Drag & Drop）に関わる全ビジュアル状態のカタログ。
 *
 * ## アーキテクチャ概要
 *
 * DayoptのDnDは **2つの独立した層** で構成されている。
 *
 * | 層 | 方式 | 用途 |
 * |---|---|---|
 * | **ローカル層** | interaction state machine (`useInteraction`) | カレンダー内カード移動・リサイズ |
 * | **プロバイダー層** | @dnd-kit (`DnDProvider`) | カレンダー内エントリ移動 |
 *
 * パレット→カレンダーはクリックで現在時刻に配置（DnD不使用）。
 */
const meta = {
  title: 'Product/Features/Calendar/DragAndDrop',
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

/** PlanCard/DragSelectionPreviewはposition:absoluteのため、relativeな親が必要。 */
function Slot({ children, height = 72 }: { children: React.ReactNode; height?: number }) {
  return (
    <div className="relative w-full" style={{ height }}>
      {children}
    </div>
  );
}

/** ストーリーのラベル表示。 */
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mb-2 text-sm">{children}</p>;
}

/** Docs用の解説ブロック。 */
function DocsNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground border-border mb-4 rounded-lg border p-4 text-xs leading-relaxed">
      {children}
    </div>
  );
}

/** 関連ファイルリスト。 */
function FileList({ files }: { files: Array<{ path: string; role: string }> }) {
  return (
    <table className="text-muted-foreground mt-2 w-full text-xs">
      <tbody>
        {files.map(({ path, role }) => (
          <tr key={path} className="border-border border-b last:border-0">
            <td className="py-1 pr-4 font-mono">{path}</td>
            <td className="py-1">{role}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const basePlan: CalendarEvent = {
  id: 'plan-1',
  title: 'Design Review',
  description: 'Weekly design sync',
  startDate: new Date('2024-01-15T10:00:00'),
  endDate: new Date('2024-01-15T11:00:00'),
  status: 'open',
  color: 'var(--primary)',
  createdAt: new Date(),
  updatedAt: new Date(),
  displayStartDate: new Date('2024-01-15T10:00:00'),
  displayEndDate: new Date('2024-01-15T11:00:00'),
  duration: 60,
  isMultiDay: false,
  origin: 'planned',
};

const basePosition = {
  top: 0,
  left: 0,
  width: 100,
  height: 72,
};

const formatTime = (hour: number, minute: number) => {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Calendar→Calendar ドラッグ系
// ---------------------------------------------------------------------------

/**
 * カレンダー内ドラッグ中の状態（isDragging=true）。掴んでいるカードの見た目。
 *
 * ### 実装方式
 * dnd-kit ではなく **interaction state machine** で実装。
 * `useInteraction` が mouse/touch を統一的に処理。
 * タッチは500ms長押しで起動。15分単位でスナップ。
 */
export const CalendarDrag: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <div className="flex flex-col gap-2">
      <DocsNote>
        <strong>Calendar → Calendar ドラッグ</strong>
        <p className="mt-1">
          カスタム mouse/touch ハンドラで実装（dnd-kit 不使用）。
          グリッドDOM測定に依存するため、Storyではビジュアル状態のみ表示。
        </p>
        <FileList
          files={[
            { path: 'interaction/useInteraction.ts', role: '統合インタラクションhook' },
            { path: 'interaction/machine.ts', role: '純粋状態機械' },
            { path: 'interaction/GhostRenderer.tsx', role: 'React Portalゴースト' },
            { path: 'stores/useCalendarDragStore.ts', role: 'グローバルドラッグ状態' },
          ]}
        />
      </DocsNote>
      <Label>isDragging=true: opacity低下 + zIndex上昇</Label>
      <Slot>
        <EntryCard entry={basePlan} position={basePosition} isDragging />
      </Slot>
    </div>
  ),
};

/** 選択状態のカード（isSelected=true）。 */
export const CalendarDragSelected: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label>isSelected=true: ring-2 ring-primary ハイライト（Ctrl/Cmd+Click）</Label>
      <Slot>
        <EntryCard entry={basePlan} position={basePosition} isSelected />
      </Slot>
    </div>
  ),
};

/** アクティブ状態のカード（isActive=true）。 */
export const CalendarDragActive: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label>isActive=true: Inspector表示中のハイライト</Label>
      <Slot>
        <EntryCard entry={basePlan} position={basePosition} isActive />
      </Slot>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// リサイズハンドル
// ---------------------------------------------------------------------------

/** PlanCardの下端にあるリサイズハンドル領域。 */
export const ResizeHandle: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <DocsNote>
        <strong>リサイズ（下端ドラッグ）</strong>
        <p className="mt-1">
          カスタム mouse ハンドラで実装。開始時刻は固定、高さ（=終了時刻）のみ変更。 15分スナップ +
          リアルタイム重複チェック。
        </p>
        <FileList
          files={[
            { path: 'interaction/machine.ts', role: 'リサイズ状態遷移・高さ計算・重複チェック' },
            {
              path: 'shared/constants/grid.constants.ts',
              role: 'HOUR_HEIGHT=72px, MINUTE_HEIGHT=1.2px',
            },
          ]}
        />
      </DocsNote>
      <Label>
        リサイズハンドルはカード下端8pxに存在（透明）。ホバーで cursor: ns-resize に変化。
      </Label>
      <Slot height={120}>
        <EntryCard entry={basePlan} position={{ ...basePosition, height: 120 }} />
      </Slot>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 時間選択ドラッグ系
// ---------------------------------------------------------------------------

/** 空き領域をドラッグして時間範囲を選択するプレビュー。 */
export const TimeSelection: Story = {
  parameters: { a11y: { test: 'todo' } },
  render: () => (
    <div className="flex flex-col gap-2">
      <DocsNote>
        <strong>時間選択ドラッグ</strong>
        <p className="mt-1">
          グリッド空き領域のドラッグで時間帯を選択。ドラッグ終了時にコンテキストメニューから新規プラン作成。
          既存プランと重複する場合は赤背景 + ⊘アイコンで警告。
        </p>
        <FileList
          files={[
            { path: 'components/CalendarDragSelection/', role: '時間選択UI本体' },
            { path: 'components/DragSelectionPreview.tsx', role: '選択範囲のプレビュー表示' },
          ]}
        />
      </DocsNote>
      <Label>空き領域ドラッグで時間選択（通常状態）</Label>
      <Slot>
        <DragSelectionPreview
          selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
          date={new Date('2099-01-01T00:00:00')}
          formatTime={formatTime}
        />
      </Slot>
    </div>
  ),
};

/** 時間選択中に既存プランと重複している場合のエラー表示。 */
export const TimeSelectionOverlap: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label>時間選択 + 重複エラー（赤背景 + Ban アイコン）</Label>
      <Slot>
        <DragSelectionPreview
          selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
          date={new Date('2099-01-01T00:00:00')}
          formatTime={formatTime}
          isOverlapping
        />
      </Slot>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 全状態一覧
// ---------------------------------------------------------------------------

/** 全DnD状態を一覧表示。 */
export const AllStates: Story = {
  parameters: { a11y: { test: 'todo' } },
  render: () => (
    <div className="flex flex-col gap-6">
      <section>
        <Label>1. CalendarDrag — isDragging=true</Label>
        <Slot>
          <EntryCard entry={basePlan} position={basePosition} isDragging />
        </Slot>
      </section>

      <section>
        <Label>2. CalendarDragSelected — isSelected=true</Label>
        <Slot>
          <EntryCard entry={basePlan} position={basePosition} isSelected />
        </Slot>
      </section>

      <section>
        <Label>3. CalendarDragActive — isActive=true</Label>
        <Slot>
          <EntryCard entry={basePlan} position={basePosition} isActive />
        </Slot>
      </section>

      <section>
        <Label>4. ResizeHandle — カード下端8pxにリサイズハンドル</Label>
        <Slot height={120}>
          <EntryCard entry={basePlan} position={{ ...basePosition, height: 120 }} />
        </Slot>
      </section>

      <section>
        <Label>5. TimeSelection — 空き領域ドラッグで時間選択</Label>
        <Slot>
          <DragSelectionPreview
            selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
            date={new Date('2099-01-01T00:00:00')}
            formatTime={formatTime}
          />
        </Slot>
      </section>

      <section>
        <Label>6. TimeSelectionOverlap — 時間選択（重複エラー）</Label>
        <Slot>
          <DragSelectionPreview
            selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
            date={new Date('2099-01-01T00:00:00')}
            formatTime={formatTime}
            isOverlapping
          />
        </Slot>
      </section>
    </div>
  ),
};
