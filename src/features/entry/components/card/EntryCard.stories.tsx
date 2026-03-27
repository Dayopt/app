import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { CalendarEvent } from '@/types/calendar-event';

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
      <Slot height={30}>
        <EntryCard
          entry={baseEntry}
          tagName="仕事"
          tagColor="blue"
          position={{ ...basePosition, height: 30 }}
        />
      </Slot>
      <p className="text-muted-foreground text-xs">モバイル（px-1.5）</p>
      <Slot height={30}>
        <EntryCard
          entry={baseEntry}
          tagName="仕事"
          tagColor="blue"
          position={{ ...basePosition, height: 30 }}
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

/** 未実行オーバーレイ。予定時間に対して実績が短かった区間に穏やかなフェードグラデーション。 */
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

/** 超過オーバーレイ。予定時間を超えて実施した区間に左アクセントグラデーション + カード拡張。 */
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

      {/* --- 予定 vs 記録 差分オーバーレイ --- */}
      <section>
        <p className="text-muted-foreground mb-2 text-xs">
          Overlay: Unexecuted（予定より実績が短い → フェードグラデーション）
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
          Overlay: Overtime（予定より実績が長い → グラデーション拡張）
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
        <p className="text-muted-foreground mb-2 text-xs">30min（コンパクト・PC）</p>
        <Slot height={36}>
          <EntryCard entry={baseEntry} position={{ ...basePosition, height: 36 }} />
        </Slot>
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">30min（コンパクト・モバイル）</p>
        <Slot height={36}>
          <EntryCard entry={baseEntry} position={{ ...basePosition, height: 36 }} isMobile />
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
