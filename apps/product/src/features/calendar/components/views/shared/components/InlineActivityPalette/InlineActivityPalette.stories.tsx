/**
 * InlineActivityPalette Stories
 *
 * カレンダーグリッド上でのドラッグ確定後に表示される
 * インラインアクティビティ選択パレット。
 *
 * useInlineCreateStore で pendingSelection をセットして表示状態を再現。
 * tRPC で activities.listTree をモックして ActivityQuickSelector に一覧を供給。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { ActivityTree } from '@/features/activities';
import { useInlineCreateStore } from '../../../../../stores/useInlineCreateStore';
import { InlineActivityPalette } from './InlineActivityPalette';

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

const TIMESTAMPS = {
  created_at: '2026-07-14T00:00:00.000Z',
  updated_at: '2026-07-14T00:00:00.000Z',
};

/** カテゴリー配下にアクティビティがネストした listTree の形 */
const ACTIVITY_TREE = {
  categories: [
    {
      category: {
        id: 'work',
        user_id: 'storybook-user',
        name: '仕事',
        color: 'blue',
        icon: 'briefcase',
        archived_at: null,
        ...TIMESTAMPS,
      },
      activities: [
        {
          id: 'development',
          user_id: 'storybook-user',
          name: '開発',
          category_id: 'work',
          archived_at: null,
          ...TIMESTAMPS,
        },
        {
          id: 'meeting',
          user_id: 'storybook-user',
          name: '会議',
          category_id: 'work',
          archived_at: null,
          ...TIMESTAMPS,
        },
      ],
    },
  ],
  uncategorized: [
    {
      id: 'workout',
      user_id: 'storybook-user',
      name: '運動',
      category_id: null,
      archived_at: null,
      ...TIMESTAMPS,
    },
  ],
} satisfies ActivityTree;

const EMPTY_ACTIVITY_TREE = { categories: [], uncategorized: [] } satisfies ActivityTree;

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/**
 * InlineActivityPalette — カレンダードラッグ後のインラインアクティビティ選択パレット
 *
 * pendingSelection がある場合のみ表示される。
 * カレンダーグリッドの相対位置に配置されることを想定しているため、
 * fullscreen レイアウトで相対コンテナ内に配置して確認する。
 */
const meta = {
  title: 'Product/Features/Calendar/Interaction/InlineActivityPalette',
  component: InlineActivityPalette,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    hourHeight: DEFAULT_HOUR_HEIGHT,
  },
} satisfies Meta<typeof InlineActivityPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * デフォルト状態（09:00–10:00 の選択範囲）
 *
 * アクティビティあり状態。選択ハイライトと選択パネルが表示される。
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

/** カテゴリー見出しの下に所属アクティビティを展開する表示。 */
export const GroupedActivities: Story = {
  parameters: {
    trpcMocks: { 'activities.listTree': ACTIVITY_TREE },
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
 * アクティビティなし状態（新規ユーザー）
 *
 * 1 件も無い場合、サンプル候補が表示される。
 */
export const EmptyActivities: Story = {
  parameters: {
    trpcMocks: { 'activities.listTree': EMPTY_ACTIVITY_TREE },
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
    trpcMocks: { 'activities.listTree': ACTIVITY_TREE },
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
