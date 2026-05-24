import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { CalendarEvent } from '../../types/calendar-event';

import { EntryCard } from './EntryCard';

/** エントリーカード。カレンダーグリッド上の表示ブロック。タグカラー・レイアウト・インタラクション状態によるバリエーション。 */
const meta = {
  title: 'Features/Entry/Card',
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
function Slot({ children, height = 70 }: { children: React.ReactNode; height?: number }) {
  return (
    <div className="relative w-full" style={{ height }}>
      {children}
    </div>
  );
}

/** グリッド罫線付きの表示コンテナ。HOUR_HEIGHT=72px基準で時間罫線を描画。 */
function GridSlot({ children, hours = 3 }: { children: React.ReactNode; hours?: number }) {
  const HOUR_HEIGHT = 72;
  return (
    <div className="relative w-64" style={{ height: hours * HOUR_HEIGHT }}>
      {/* グリッド罫線 */}
      {Array.from({ length: hours + 1 }, (_, i) => (
        <div
          key={i}
          className="border-border absolute right-0 left-0 border-t"
          style={{ top: i * HOUR_HEIGHT }}
        />
      ))}
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
};

/** ENTRY_PADDING=2 が height から引かれた後の値（layoutEntryToVerticalPosition 準拠） */
const basePosition = {
  top: 0,
  left: 0,
  width: 100,
  height: 70,
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
// タグ・レイアウト・選択・アクティブ状態
// ---------------------------------------------------------------------------

/** タグカラー付き。tagName と tagColor を渡すとアクセントカラーが変わる。 */
export const WithTag: Story = {
  render: () => (
    <Slot>
      <EntryCard entry={baseEntry} tagName="仕事" tagColor="blue" position={basePosition} />
    </Slot>
  ),
};

/** モバイルレイアウト。isMobile={true} で左アクセント幅が 2px になる。 */
export const MobileLayout: Story = {
  render: () => (
    <Slot>
      <EntryCard entry={baseEntry} position={basePosition} isMobile />
    </Slot>
  ),
};

/** コンパクト表示（高さ < 40px）。パディング縮小 + 横並びレイアウトで省スペース化。 */
export const CompactLayout: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">PC（px-2）</p>
      <Slot height={34}>
        <EntryCard
          entry={baseEntry}
          tagName="仕事"
          tagColor="blue"
          position={{ ...basePosition, height: 34 }}
        />
      </Slot>
      <p className="text-muted-foreground text-xs">モバイル（px-2）</p>
      <Slot height={34}>
        <EntryCard
          entry={baseEntry}
          tagName="仕事"
          tagColor="blue"
          position={{ ...basePosition, height: 34 }}
          isMobile
        />
      </Slot>
    </div>
  ),
};

/** 選択状態。ring-primary の枠線が付く。 */
export const SelectedState: Story = {
  render: () => (
    <Slot>
      <EntryCard entry={baseEntry} position={basePosition} isSelected />
    </Slot>
  ),
};

/** アクティブ状態（Inspector で開いているエントリ）。brightness-110 が適用される。 */
export const ActiveState: Story = {
  render: () => (
    <Slot>
      <EntryCard entry={baseEntry} position={basePosition} isActive />
    </Slot>
  ),
};

/** ドラッグ中状態。opacity-30 で半透明化（ドラッグゴーストの元カード）。 */
export const DraggingState: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <Slot>
      <EntryCard
        entry={baseEntry}
        tagName="仕事"
        tagColor="blue"
        position={basePosition}
        isDragging
      />
    </Slot>
  ),
};

// ---------------------------------------------------------------------------
// 予定 vs 記録の差分オーバーレイ
// ---------------------------------------------------------------------------

/** planned と actual が同じ範囲。actual が planned を覆うため通常カードとして見える。 */
export const PlannedActualSame: Story = {
  render: () => (
    <Slot>
      <EntryCard
        entry={{
          ...baseEntry,
          entryState: 'past',
          origin: 'planned',
          actualStartDate: new Date('2024-01-15T10:00:00'),
          actualEndDate: new Date('2024-01-15T11:00:00'),
        }}
        tagName="仕事"
        tagColor="blue"
        position={basePosition}
        hourHeight={72}
      />
    </Slot>
  ),
};

/** actual が planned より短い。余った planned 時間は薄い背景として露出する。 */
export const PlannedActualShorter: Story = {
  render: () => (
    <Slot height={142}>
      <EntryCard
        entry={{
          ...baseEntry,
          entryState: 'past',
          origin: 'planned',
          endDate: new Date('2024-01-15T12:00:00'),
          displayEndDate: new Date('2024-01-15T12:00:00'),
          duration: 120,
          actualStartDate: new Date('2024-01-15T10:00:00'),
          actualEndDate: new Date('2024-01-15T11:00:00'),
        }}
        tagName="Deep Work"
        tagColor="blue"
        position={{ ...basePosition, height: 142 }}
        hourHeight={72}
      />
    </Slot>
  ),
};

/** actual が planned 内でズレた状態。planned 背景の上に actual カードが重なる。 */
export const PlannedActualShifted: Story = {
  render: () => (
    <Slot height={142}>
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
        tagName="Deep Work"
        tagColor="blue"
        position={{ ...basePosition, height: 142 }}
        hourHeight={72}
      />
    </Slot>
  ),
};

/** 未実行区間。予定時間に対して実績が短かった区間に planned 背景が露出する。 */
export const OverlayUnexecuted: Story = {
  render: () => (
    <Slot height={142}>
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
        position={{ ...basePosition, height: 142 }}
        hourHeight={72}
      />
    </Slot>
  ),
};

/** 実績が予定を超えた区間。超過部分は従来どおり破線オーバーレイで表示する。 */
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
        tagName="Deep Work"
        tagColor="blue"
        position={{ ...basePosition, height: 70 }}
        hourHeight={72}
      />
    </Slot>
  ),
};

/** 実績超過（グリッド罫線付き）。超過の破線オーバーレイとグリッドとの整合を確認。 */
export const OverlayOvertimeOnGrid: Story = {
  render: () => {
    const HOUR_HEIGHT = 72;
    return (
      <GridSlot hours={4}>
        <EntryCard
          entry={{
            ...baseEntry,
            entryState: 'past',
            origin: 'planned',
            startDate: new Date('2024-01-15T10:00:00'),
            endDate: new Date('2024-01-15T11:00:00'),
            displayStartDate: new Date('2024-01-15T10:00:00'),
            displayEndDate: new Date('2024-01-15T11:00:00'),
            duration: 60,
            actualStartDate: new Date('2024-01-15T09:30:00'),
            actualEndDate: new Date('2024-01-15T11:30:00'),
          }}
          tagName="Deep Work"
          tagColor="blue"
          position={{
            top: 1 * HOUR_HEIGHT,
            left: 0,
            width: 100,
            height: 1 * HOUR_HEIGHT - 2,
          }}
          hourHeight={HOUR_HEIGHT}
        />
      </GridSlot>
    );
  },
};

// ---------------------------------------------------------------------------
// 予定外（origin='unplanned'）
// ---------------------------------------------------------------------------

/** 予定外エントリ。破線枠 + bg-background。親カード内側にオフセット配置される。 */
export const Unplanned: Story = {
  render: () => (
    <Slot>
      <EntryCard
        entry={{
          ...baseEntry,
          origin: 'unplanned',
          actualStartDate: new Date('2024-01-15T10:00:00'),
          actualEndDate: new Date('2024-01-15T11:00:00'),
        }}
        tagName="割り込み対応"
        tagColor="red"
        position={basePosition}
      />
    </Slot>
  ),
};

/** 予定外エントリ（グリッド罫線付き）。内側オフセットの見え方を確認。 */
export const UnplannedOnGrid: Story = {
  render: () => {
    const HOUR_HEIGHT = 72;
    return (
      <GridSlot hours={3}>
        <EntryCard
          entry={{
            ...baseEntry,
            origin: 'unplanned',
            actualStartDate: new Date('2024-01-15T10:00:00'),
            actualEndDate: new Date('2024-01-15T11:30:00'),
            displayEndDate: new Date('2024-01-15T11:30:00'),
            duration: 90,
          }}
          tagName="緊急対応"
          tagColor="orange"
          position={{
            top: 1 * HOUR_HEIGHT,
            left: 0,
            width: 100,
            height: 1.5 * HOUR_HEIGHT - 2,
          }}
          hourHeight={HOUR_HEIGHT}
        />
      </GridSlot>
    );
  },
};

/** 親エントリの短縮枠（unexecuted）内に計画外カードが入れ子で収まるパターン。
 * 親: 10:00-12:00予定、11:00に実績終了 → 11:00-12:00がハッチング
 * 子: 計画外カード 11:00-12:00 が親の内側にオフセット配置 */
export const UnplannedInGap: Story = {
  render: () => {
    const HOUR_HEIGHT = 72;
    return (
      <GridSlot hours={3}>
        {/* 親エントリ: 10:00-12:00予定、実績11:00終了 */}
        <EntryCard
          entry={{
            ...baseEntry,
            startDate: new Date('2024-01-15T10:00:00'),
            endDate: new Date('2024-01-15T12:00:00'),
            displayStartDate: new Date('2024-01-15T10:00:00'),
            displayEndDate: new Date('2024-01-15T12:00:00'),
            duration: 120,
            entryState: 'past',
            actualStartDate: new Date('2024-01-15T10:00:00'),
            actualEndDate: new Date('2024-01-15T11:00:00'),
          }}
          tagName="Deep Work"
          tagColor="blue"
          position={{
            top: 0,
            left: 0,
            width: 100,
            height: 2 * HOUR_HEIGHT - 2,
          }}
          hourHeight={HOUR_HEIGHT}
        />
        {/* 計画外カード: 11:00-12:00（親の空き枠に入れ子） */}
        <EntryCard
          entry={{
            ...baseEntry,
            id: 'unplanned-1',
            origin: 'unplanned',
            startDate: new Date('2024-01-15T11:00:00'),
            endDate: new Date('2024-01-15T11:00:00'),
            displayStartDate: new Date('2024-01-15T11:00:00'),
            displayEndDate: new Date('2024-01-15T12:00:00'),
            duration: 60,
            actualStartDate: new Date('2024-01-15T11:00:00'),
            actualEndDate: new Date('2024-01-15T12:00:00'),
          }}
          tagName="散歩"
          tagColor="green"
          position={{
            top: 1 * HOUR_HEIGHT,
            left: 0,
            width: 100,
            height: 1 * HOUR_HEIGHT - 2,
          }}
          hourHeight={HOUR_HEIGHT}
        />
      </GridSlot>
    );
  },
};

// ---------------------------------------------------------------------------
// 状態バリエーション
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// サイズバリエーション
// ---------------------------------------------------------------------------

/** 時間帯による高さの違い（HOUR_HEIGHT=72px, ENTRY_PADDING=2pxベース）。 */
export const SizeVariations: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Slot height={20}>
        <EntryCard entry={baseEntry} position={{ ...basePosition, height: 20 }} />
      </Slot>
      <Slot height={34}>
        <EntryCard entry={baseEntry} position={{ ...basePosition, height: 34 }} />
      </Slot>
      <Slot>
        <EntryCard entry={baseEntry} position={basePosition} />
      </Slot>
      <Slot height={142}>
        <EntryCard entry={baseEntry} position={{ ...basePosition, height: 142 }} />
      </Slot>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 全パターン一覧
// ---------------------------------------------------------------------------

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  // color-contrast: text-muted-foreground on plan card background
  parameters: { a11y: { test: 'todo' } },
  render: () => (
    <div className="flex flex-col gap-8">
      {/* --- Draft --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">Draft（未保存プレビュー）</p>
        <Slot>
          <EntryCard
            entry={{ ...baseEntry, id: '__draft__', title: '', isDraft: true }}
            position={basePosition}
          />
        </Slot>
      </section>

      {/* --- タグ・レイアウト・インタラクション状態 --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">WithTag（タグカラー: blue）</p>
        <Slot>
          <EntryCard entry={baseEntry} tagName="仕事" tagColor="blue" position={basePosition} />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">MobileLayout（isMobile=true）</p>
        <Slot>
          <EntryCard entry={baseEntry} position={basePosition} isMobile />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">SelectedState（isSelected=true）</p>
        <Slot>
          <EntryCard entry={baseEntry} position={basePosition} isSelected />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">ActiveState（isActive=true）</p>
        <Slot>
          <EntryCard entry={baseEntry} position={basePosition} isActive />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">
          DraggingState（isDragging=true, opacity-30）
        </p>
        <Slot>
          <EntryCard
            entry={baseEntry}
            tagName="仕事"
            tagColor="blue"
            position={basePosition}
            isDragging
          />
        </Slot>
      </section>

      {/* --- 予定外 --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">
          Unplanned（予定外 → 破線枠 + 内側オフセット）
        </p>
        <Slot>
          <EntryCard
            entry={{
              ...baseEntry,
              origin: 'unplanned',
              actualStartDate: new Date('2024-01-15T10:00:00'),
              actualEndDate: new Date('2024-01-15T11:00:00'),
            }}
            tagName="割り込み対応"
            tagColor="red"
            position={basePosition}
          />
        </Slot>
      </section>

      {/* --- 予定 vs 記録 差分オーバーレイ --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">
          Overlay: Unexecuted（予定より実績が短い → フェードグラデーション）
        </p>
        <Slot height={142}>
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
            position={{ ...basePosition, height: 142 }}
            hourHeight={72}
          />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">
          Overlay: Overtime（予定より実績が長い → 破線枠で超過区間を表示）
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
            tagName="Deep Work"
            tagColor="blue"
            position={{ ...basePosition, height: 70 }}
            hourHeight={72}
          />
        </Slot>
      </section>

      {/* --- サイズバリエーション --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">15min（最小・1行）</p>
        <Slot height={20}>
          <EntryCard entry={baseEntry} position={{ ...basePosition, height: 20 }} />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">30min（コンパクト・PC）</p>
        <Slot height={34}>
          <EntryCard entry={baseEntry} position={{ ...basePosition, height: 34 }} />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">30min（コンパクト・モバイル）</p>
        <Slot height={34}>
          <EntryCard entry={baseEntry} position={{ ...basePosition, height: 34 }} isMobile />
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
        <Slot height={142}>
          <EntryCard entry={baseEntry} position={{ ...basePosition, height: 142 }} />
        </Slot>
      </section>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// グリッド整列確認
// ---------------------------------------------------------------------------

/**
 * グリッド罫線との整列確認。
 * top はグリッド線にぴったり、隙間(2px)は height の内側から取る。
 * 連続ブロック間でズレが蓄積しないことを視覚確認できる。
 */
export const GridAlignment: Story = {
  render: () => {
    const HOUR_HEIGHT = 72;
    const ENTRY_PADDING = 2;

    return (
      <GridSlot hours={3}>
        {/* 0:00–1:00 */}
        <EntryCard
          entry={{ ...baseEntry, id: 'a' }}
          tagName="タグ"
          tagColor="green"
          position={{
            top: 0 * HOUR_HEIGHT,
            left: 0,
            width: 100,
            height: 1 * HOUR_HEIGHT - ENTRY_PADDING,
          }}
        />
        {/* 1:00–2:00 */}
        <EntryCard
          entry={{ ...baseEntry, id: 'b' }}
          tagName="タグ"
          tagColor="green"
          position={{
            top: 1 * HOUR_HEIGHT,
            left: 0,
            width: 100,
            height: 1 * HOUR_HEIGHT - ENTRY_PADDING,
          }}
        />
        {/* 2:00–3:00 */}
        <EntryCard
          entry={{ ...baseEntry, id: 'c' }}
          tagName="タグ"
          tagColor="green"
          position={{
            top: 2 * HOUR_HEIGHT,
            left: 0,
            width: 100,
            height: 1 * HOUR_HEIGHT - ENTRY_PADDING,
          }}
        />
      </GridSlot>
    );
  },
};
