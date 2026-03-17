import { useEffect } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useCalendarDragStore } from '../../../../stores/useCalendarDragStore';
import type { CalendarEvent } from '../../../../types/calendar.types';

import { EntryCard } from '@/features/entry';
import { DragSelectionPreview } from './CalendarDragSelection/DragSelectionPreview';
import { PanelDragPreview } from './PanelDragPreview';

/**
 * DnD（Drag & Drop）に関わる全ビジュアル状態のカタログ。
 *
 * ## アーキテクチャ概要
 *
 * DayoptのDnDは **3つの独立した層** で構成されている。
 *
 * | 層 | 方式 | 用途 |
 * |---|---|---|
 * | **ローカル層** | interaction state machine (`useInteraction`) | カレンダー内カード移動・リサイズ |
 * | **グローバル層** | Zustand (`useCalendarDragStore`) | 複数日付間のドラッグ状態共有 |
 * | **プロバイダー層** | @dnd-kit (`DnDProvider`) | パネル↔カレンダー間ドラッグ |
 *
 * ### グリッド定数 (`grid.constants.ts`)
 * - `HOUR_HEIGHT = 72px` — 1時間あたりの高さ（基準値）
 * - `MINUTE_HEIGHT = 1.2px` — 1分あたりの高さ（基準値）
 * - `TIME_COLUMN_WIDTH = 56px` — 左側の時間列幅
 *
 * **重要**: 実際のグリッド高さはデバイス・密度設定により可変（48-96px）。
 * ドラッグ時間計算では `useResponsiveHourHeight()` から取得した値を使うこと。
 * 定数 `HOUR_HEIGHT` をドラッグ計算に直接使うと、ピクセル→時間変換がずれる。
 *
 * ### タイムゾーン対応
 * グリッド上の時間はカレンダー設定TZ（`useCalendarSettingsStore.timezone`）で表示される。
 * ドラッグで得た hour/minute はカレンダーTZの値として解釈し、
 * `convertFromTimezone()` でUTCに変換してから保存する。
 * ゴースト要素の時刻表示には `formatInTimezone()` を使用する。
 *
 * ### タグ並び替え
 * タグDnDは `TagSortableTree` コンポーネントが @dnd-kit で自己完結しており、
 * TagReorder / TagReorderNested でインタラクティブに操作可能。
 */
const meta = {
  title: 'Features/Calendar/DragAndDrop',
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
    <div className="text-muted-foreground border-border mb-4 rounded-md border p-4 text-xs leading-relaxed">
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
  isRecurring: false,
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
 * ### データフロー
 * ```
 * PlanCard onMouseDown
 *   → useInteraction.handlePointerDown
 *   → interaction state machine（状態遷移: idle→pending→dragging）
 *   → useCalendarDragStore.startDrag（グローバル状態更新）
 *   → PlanCard isDragging=true（opacity低下 + z-30）
 *   → GhostRenderer（React Portalでゴースト描画）
 * ```
 *
 * ### 実装方式
 * dnd-kit ではなく **interaction state machine** で実装。
 * `useInteraction` が mouse/touch を統一的に処理。
 * タッチは500ms長押しで起動。15分単位でスナップ。
 *
 * ### 注意点
 * - ピクセル→時間変換には `useResponsiveHourHeight()` の値を使用すること（定数 `HOUR_HEIGHT` は不可）
 * - 時間計算後は `convertFromTimezone(localTime, timezone)` でUTCに変換してから保存
 * - ゴースト要素の時刻表示は `formatInTimezone()` でカレンダーTZ表示
 */
export const CalendarDrag: Story = {
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
            { path: 'components/PlanCard/PlanCard.tsx', role: 'ドラッグ対象カード' },
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

/**
 * 選択状態のカード（isSelected=true）。
 * Ctrl+Click / Cmd+Click で複数選択時に ring-2 ring-primary でハイライト。
 */
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

/**
 * アクティブ状態のカード（isActive=true）。
 * カードクリックでInspector表示中のハイライト。isSelectedとは排他。
 */
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

/**
 * PlanCardの下端にあるリサイズハンドル領域。
 *
 * ### 仕組み
 * - カード下端 8px がリサイズ領域（透明、cursor: ns-resize）
 * - **開始時刻は固定**、高さ（=終了時刻）のみ変更
 * - 15分単位でスナップ（`snapToQuarterHour`）
 * - リサイズ中にリアルタイム重複チェック → 重複時は赤オーバーレイ表示
 *
 * ### データフロー
 * ```
 * ハンドル onMouseDown
 *   → useResizeHandler.handleResizeStart
 *   → mousemove: deltaY → newHeight 計算 → snapToQuarterHour
 *   → 重複チェック → 視覚的フィードバック
 *   → mouseup: 確定 → API更新
 * ```
 */
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
            {
              path: 'interaction/machine.ts',
              role: 'リサイズ状態遷移・高さ計算・重複チェック',
            },
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
// Panel→Calendar ドラッグ系
// ---------------------------------------------------------------------------

/**
 * パネル→カレンダードラッグのプレビュー。
 *
 * ### 仕組み
 * サイドバーの PlanCard を @dnd-kit の `useDraggable` でドラッグ開始し、
 * カレンダーグリッド側の `useDroppable` でドロップ先を判定。
 *
 * ### データフロー
 * ```
 * PanelPlanCard (useDraggable)
 *   → DnDProvider.onDragStart → useCalendarDragStore.startPanelDrag
 *   → DnDProvider.onDragMove  → targetDateIndex / previewTime 更新
 *   → PanelDragPreview 表示（dragSource === 'panel' で自動検知）
 *   → DnDProvider.onDragEnd   → dropData 解析 → updatePlan API
 * ```
 *
 * ### ストアの役割
 * `useCalendarDragStore` がパネルドラッグ状態をグローバルに共有。
 * `PanelDragPreview` は `dragSource === 'panel'` のときだけ表示される。
 */

/** PanelDragPreview用のラッパー。useCalendarDragStoreにパネルドラッグ状態をセット。 */
function PanelDragPreviewStory() {
  useEffect(() => {
    const start = new Date('2024-01-15T10:00:00');
    const end = new Date('2024-01-15T11:00:00');

    useCalendarDragStore.setState({
      dragSource: 'panel',
      targetDateIndex: 0,
      snappedPosition: { top: 0, height: 72 },
      previewTime: { start, end },
      isDragging: true,
      draggedPlanData: {
        id: 'panel-plan-1',
        title: 'Panel Drag Preview',
      },
    });

    return () => {
      useCalendarDragStore.getState().endDrag();
    };
  }, []);

  return (
    <Slot>
      <PanelDragPreview dayIndex={0} />
    </Slot>
  );
}

/** パネルからカレンダーへドラッグ中のプレビュー。ストア経由で描画。 */
export const PanelDragPreviewStoryExport: Story = {
  name: 'PanelDragPreview',
  render: () => (
    <div className="flex flex-col gap-2">
      <DocsNote>
        <strong>Panel → Calendar ドラッグ</strong>
        <p className="mt-1">
          @dnd-kit の DndContext で実装。サイドバーから PlanCard をドラッグし、
          カレンダーグリッドにドロップ。PointerSensor（8px移動）/ TouchSensor（250ms長押し）。
        </p>
        <FileList
          files={[
            { path: 'providers/DnDProvider.tsx', role: 'dnd-kit コンテキスト + DragOverlay' },
            { path: 'stores/useCalendarDragStore.ts', role: 'パネルドラッグ状態をグローバル共有' },
            { path: 'components/PanelDragPreview.tsx', role: 'ドロップ先プレビュー表示' },
          ]}
        />
      </DocsNote>
      <Label>Panel → Calendar ドラッグ中のドロップ先プレビュー</Label>
      <PanelDragPreviewStory />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 時間選択ドラッグ系
// ---------------------------------------------------------------------------

/**
 * 空き領域をドラッグして時間範囲を選択するプレビュー。
 *
 * ### 仕組み
 * カレンダーグリッドの空き領域をマウスドラッグすると、
 * 選択範囲が `DragSelectionPreview` で表示される。
 * ドラッグ終了時にコンテキストメニューが表示され、新規プラン作成が可能。
 *
 * ### データフロー
 * ```
 * グリッド空き領域 onMouseDown
 *   → DragSelectionLayer.handleDragStart
 *   → mousemove: startHour/endHour 計算
 *   → DragSelectionPreview 表示（通常: 青背景 / 重複: 赤背景+⊘）
 *   → mouseup: コンテキストメニュー → 新規プラン作成
 * ```
 */
export const TimeSelection: Story = {
  // color-contrast: text-foreground/60 on drag selection background
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
            { path: 'components/DragSelectionLayer.tsx', role: 'ドラッグイベント管理レイヤー' },
            { path: 'components/DragSelectionPreview.tsx', role: '選択範囲のプレビュー表示' },
          ]}
        />
      </DocsNote>
      <Label>空き領域ドラッグで時間選択（通常状態）</Label>
      <Slot>
        <DragSelectionPreview
          selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
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
  // color-contrast: text-foreground/60 on drag selection background
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
        <Label>5. PanelDragPreview — Panel → Calendar ドロップ先プレビュー</Label>
        <PanelDragPreviewStory />
      </section>

      <section>
        <Label>6. TimeSelection — 空き領域ドラッグで時間選択</Label>
        <Slot>
          <DragSelectionPreview
            selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
            formatTime={formatTime}
          />
        </Slot>
      </section>

      <section>
        <Label>7. TimeSelectionOverlap — 時間選択（重複エラー）</Label>
        <Slot>
          <DragSelectionPreview
            selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
            formatTime={formatTime}
            isOverlapping
          />
        </Slot>
      </section>
    </div>
  ),
};
