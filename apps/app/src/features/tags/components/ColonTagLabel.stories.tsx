import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { CalendarEvent } from '@/lib/types/calendar-event';

import { BlockItem } from '@/lib/components/shell/sidebar/BlockItem';

import { EntryCardContent } from '../../entry/components/card/EntryCardContent';
import { TagIcon } from './TagIcon';

import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';

/**
 * ColonTagLabel — コロンタグの separator 表示
 *
 * コロン記法タグ（例: "開発:API"）を prefix 薄字 + › + suffix で表示する。
 * コロンなしタグはそのまま表示される。
 */
const meta = {
  title: 'Features/Tags/ColonTagLabel',
  component: ColonTagLabel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof ColonTagLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// 基本パターン
// ---------------------------------------------------------------------------

const colonTags = ['開発:API', '仕事:定例MTG', 'プロジェクト:デザインレビュー'];
const flatTags = ['運動', '休憩'];

/** コロンタグとフラットタグの基本表示 */
export const Default: Story = {
  args: { name: '' },
  render: () => (
    <div className="space-y-4">
      <section>
        <p className="text-muted-foreground mb-2 text-xs">コロンタグ</p>
        <div className="space-y-1">
          {colonTags.map((name) => (
            <div key={name} className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground w-40 shrink-0 truncate text-xs">{name}</span>
              <span className="text-foreground">→</span>
              <ColonTagLabel name={name} />
            </div>
          ))}
        </div>
      </section>
      <section>
        <p className="text-muted-foreground mb-2 text-xs">フラットタグ（変化なし）</p>
        <div className="space-y-1">
          {flatTags.map((name) => (
            <div key={name} className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground w-40 shrink-0 truncate text-xs">{name}</span>
              <span className="text-foreground">→</span>
              <ColonTagLabel name={name} />
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// カード文脈
// ---------------------------------------------------------------------------

const baseEntry: CalendarEvent = {
  id: 'entry-1',
  title: 'タスク',
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

function CardSlot({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 text-xs">{label}</p>
      <div className="bg-card border-tag-blue relative h-16 w-48 overflow-hidden rounded-r-lg border-l-[3px] p-2 text-sm">
        {children}
      </div>
    </div>
  );
}

/**
 * EntryCardContent でのコロンタグ表示。
 *
 * 通常カードとコンパクトカードの両方を確認。
 */
export const InCardContext: Story = {
  args: { name: '' },
  render: () => (
    <div className="space-y-6">
      <h3 className="text-sm">通常カード</h3>
      <div className="flex flex-wrap gap-4">
        <CardSlot label="コロンタグ">
          <EntryCardContent plan={baseEntry} tagName="開発:API" timeFormat="24h" />
        </CardSlot>
        <CardSlot label="フラットタグ">
          <EntryCardContent plan={baseEntry} tagName="仕事" timeFormat="24h" />
        </CardSlot>
      </div>

      <h3 className="text-sm">コンパクトカード</h3>
      <div className="flex flex-wrap gap-4">
        <div>
          <p className="text-muted-foreground mb-1 text-xs">コロンタグ</p>
          <div className="bg-card border-tag-blue relative h-7 w-48 overflow-hidden rounded-r-lg border-l-[3px] px-2 text-xs">
            <EntryCardContent plan={baseEntry} tagName="開発:API" isCompact />
          </div>
        </div>
        <div>
          <p className="text-muted-foreground mb-1 text-xs">フラットタグ</p>
          <div className="bg-card border-tag-blue relative h-7 w-48 overflow-hidden rounded-r-lg border-l-[3px] px-2 text-xs">
            <EntryCardContent plan={baseEntry} tagName="仕事" isCompact />
          </div>
        </div>
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// BlockItem（履歴）文脈
// ---------------------------------------------------------------------------

/**
 * BlockItem（履歴・パレット）文脈での表示確認。
 *
 * BlockItem 内部で ColonTagLabel（separator）が適用される。
 */
export const InBlockItemContext: Story = {
  args: { name: '' },
  render: () => (
    <div className="w-64 space-y-1">
      <p className="text-muted-foreground mb-1 text-xs">コロンタグ</p>
      <BlockItem
        tagName="開発:API"
        iconSlot={<TagIcon icon="code" color="blue" size="sm" />}
        durationMinutes={60}
        onClick={fn()}
      />
      <BlockItem
        tagName="仕事:定例MTG"
        iconSlot={<TagIcon icon="users" color="green" size="sm" />}
        durationMinutes={30}
        onClick={fn()}
      />
      <p className="text-muted-foreground mt-2 mb-1 text-xs">フラットタグ（変化なし）</p>
      <BlockItem
        tagName="運動"
        iconSlot={<TagIcon icon="dumbbell" color="amber" size="sm" />}
        durationMinutes={45}
        onClick={fn()}
      />
      <BlockItem
        tagName="休憩"
        iconSlot={<TagIcon icon="coffee" color="orange" size="sm" />}
        durationMinutes={15}
        onClick={fn()}
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 長いタグ名での truncate 確認
// ---------------------------------------------------------------------------

/** 長いタグ名での truncate 挙動を確認。 */
export const LongNames: Story = {
  args: { name: '' },
  render: () => (
    <div className="w-48 space-y-2">
      <div className="overflow-hidden text-sm">
        <p className="text-muted-foreground mb-1 text-xs">コロンタグ（長い名前）</p>
        <ColonTagLabel name="プロジェクト管理:デザインレビュー定例ミーティング準備" />
      </div>
      <div className="overflow-hidden text-sm">
        <p className="text-muted-foreground mb-1 text-xs">フラットタグ（長い名前）</p>
        <ColonTagLabel name="プロジェクト管理・定例ミーティング準備" />
      </div>
    </div>
  ),
};
