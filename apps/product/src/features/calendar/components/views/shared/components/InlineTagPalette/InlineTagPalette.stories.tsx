/**
 * InlineTagPalette Stories
 *
 * カレンダーグリッド上でのドラッグ確定後に表示される
 * インラインタグ選択パレット。
 *
 * useInlineCreateStore で pendingSelection をセットして表示状態を再現。
 * tRPC で tags.list をモックして TagQuickSelector にタグ一覧を供給。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { Tag } from '@/features/tags';
import { useInlineCreateStore } from '../../../../../stores/useInlineCreateStore';
import { InlineTagPalette } from './InlineTagPalette';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

/** 1時間あたりのデフォルト高さ（px） */
const DEFAULT_HOUR_HEIGHT = 60;

/**
 * 未来日付（ストーリー固定値）。
 * Plan レーンのアウトラインカードを見せる目的で未来に固定する。
 */
const FUTURE_DAY = new Date('2099-01-01T00:00:00.000Z');

/** 過去日付（Record レーンの塗りカードを確認する用） */
const PAST_DAY = new Date('2020-01-01T00:00:00.000Z');

const GROUPED_TAGS = [
  {
    id: 'work',
    user_id: 'storybook-user',
    name: '仕事',
    color: 'blue',
    icon: 'briefcase',
    parent_id: null,
    sort_order: 0,
    is_active: true,
    archived_at: null,
    created_at: '2026-07-14T00:00:00.000Z',
    updated_at: '2026-07-14T00:00:00.000Z',
  },
  {
    id: 'development',
    user_id: 'storybook-user',
    name: '開発',
    color: 'indigo',
    icon: 'code',
    parent_id: 'work',
    sort_order: 0,
    is_active: true,
    archived_at: null,
    created_at: '2026-07-14T00:00:00.000Z',
    updated_at: '2026-07-14T00:00:00.000Z',
  },
  {
    id: 'meeting',
    user_id: 'storybook-user',
    name: '会議',
    color: 'violet',
    icon: 'users',
    parent_id: 'work',
    sort_order: 1,
    is_active: true,
    archived_at: null,
    created_at: '2026-07-14T00:00:00.000Z',
    updated_at: '2026-07-14T00:00:00.000Z',
  },
] satisfies Tag[];

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/**
 * InlineTagPalette — カレンダードラッグ後のインラインタグ選択パレット
 *
 * pendingSelection がある場合のみ表示される。
 * カレンダーグリッドの相対位置に配置されることを想定しているため、
 * fullscreen レイアウトで相対コンテナ内に配置して確認する。
 */
const meta = {
  title: 'Product/Features/Calendar/Interaction/InlineTagPalette',
  component: InlineTagPalette,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    hourHeight: DEFAULT_HOUR_HEIGHT,
  },
} satisfies Meta<typeof InlineTagPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * デフォルト状態（09:00–10:00 の選択範囲）
 *
 * タグあり状態。選択ハイライトとタグ選択パネルが表示される。
 */
export const Default: Story = {
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: FUTURE_DAY,
          startHour: 9,
          startMinute: 0,
          endHour: 10,
          endMinute: 0,
        },
      });
      return (
        <div className="relative h-[1440px] w-full">
          <Story />
        </div>
      );
    },
  ],
};

/** 親タグの直下に小タグを展開する表示。 */
export const GroupedTags: Story = {
  parameters: {
    trpcMocks: { 'tags.list': { data: GROUPED_TAGS } },
  },
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: FUTURE_DAY,
          startHour: 9,
          startMinute: 0,
          endHour: 10,
          endMinute: 0,
        },
      });
      return (
        <div className="relative h-[1440px] w-full">
          <Story />
        </div>
      );
    },
  ],
};

/**
 * 短い選択範囲（09:00–09:30、30分）
 *
 * 高さが低い状態でのハイライト表示を確認できる。
 */
export const ShortSelection: Story = {
  args: {
    hourHeight: DEFAULT_HOUR_HEIGHT,
  },
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: FUTURE_DAY,
          startHour: 9,
          startMinute: 0,
          endHour: 9,
          endMinute: 30,
        },
      });
      return (
        <div className="relative h-[1440px] w-full">
          <Story />
        </div>
      );
    },
  ],
};

/**
 * 長い選択範囲（09:00–11:00、2時間）
 *
 * 高さが大きい状態でのハイライト表示を確認できる。
 */
export const LongSelection: Story = {
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: FUTURE_DAY,
          startHour: 9,
          startMinute: 0,
          endHour: 11,
          endMinute: 0,
        },
      });
      return (
        <div className="relative h-[1440px] w-full">
          <Story />
        </div>
      );
    },
  ],
};

/**
 * タグなし状態（新規ユーザー）
 *
 * タグが存在しない場合、サンプルタグ候補が表示される。
 */
export const EmptyTags: Story = {
  parameters: {
    trpcMocks: { 'tags.list': { data: [] } },
  },
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: FUTURE_DAY,
          startHour: 14,
          startMinute: 0,
          endHour: 15,
          endMinute: 0,
        },
      });
      return (
        <div className="relative h-[1440px] w-full">
          <Story />
        </div>
      );
    },
  ],
};

/**
 * 過去の時間帯（Record レーンの塗りカード）
 *
 * 過去に確定すると Record として保存されるため、右レーンで表示される。
 */
export const PastSelection: Story = {
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: PAST_DAY,
          startHour: 9,
          startMinute: 0,
          endHour: 10,
          endMinute: 0,
        },
      });
      return (
        <div className="relative h-[1440px] w-full">
          <Story />
        </div>
      );
    },
  ],
};

/**
 * pendingSelection が null（非表示状態）
 *
 * ドラッグ前 or クリア後は何も表示されない。
 */
export const NoPendingSelection: Story = {
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({ pendingSelection: null });
      return (
        <div className="relative h-[1440px] w-full">
          <Story />
        </div>
      );
    },
  ],
};

/** 全パターンの基準となるインタラクティブ表示。 */
export const AllPatterns: Story = {
  parameters: {
    trpcMocks: { 'tags.list': { data: GROUPED_TAGS } },
  },
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: FUTURE_DAY,
          startHour: 9,
          startMinute: 0,
          endHour: 10,
          endMinute: 0,
        },
      });
      return (
        <div className="relative h-[1440px] w-full">
          <Story />
        </div>
      );
    },
  ],
};
