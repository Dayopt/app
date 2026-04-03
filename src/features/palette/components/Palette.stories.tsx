/**
 * Palette Stories
 *
 * サイドバーのパレットセクション（ピン留めブロックのクイック配置）。
 * 追加はインスペクター・履歴から。削除のみホバーで可能。編集なし。
 * tRPC で palette.list / tags.list をモック。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { StoryTRPCProvider } from '../../../../.storybook/mocks/trpc';
import { Palette } from './Palette';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

const MOCK_TAGS = [
  {
    id: 'tag-work',
    name: '仕事',
    user_id: 'user-1',
    color: 'blue',
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-study',
    name: '勉強',
    user_id: 'user-1',
    color: 'green',
    is_active: true,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-exercise',
    name: '運動',
    user_id: 'user-1',
    color: 'amber',
    is_active: true,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-rest',
    name: '休憩',
    user_id: 'user-1',
    color: 'orange',
    is_active: true,
    sort_order: 3,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-meeting',
    name: '会議',
    user_id: 'user-1',
    color: 'indigo',
    is_active: true,
    sort_order: 4,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const MOCK_PINNED_ITEMS = [
  { id: 'pin-1', tag_id: 'tag-work', duration_minutes: 60, sort_order: 0, is_pinned: true },
  { id: 'pin-2', tag_id: 'tag-study', duration_minutes: 30, sort_order: 1, is_pinned: true },
  { id: 'pin-3', tag_id: 'tag-exercise', duration_minutes: 45, sort_order: 2, is_pinned: true },
];

const MOCK_TRPC = {
  'palette.list': MOCK_PINNED_ITEMS,
  'tags.list': { data: MOCK_TAGS },
  'entries.list': [],
};

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Palette/Overview',
  component: Palette,
  parameters: {
    layout: 'padded',
    trpcMocks: MOCK_TRPC,
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Palette>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** ピン留め3件の標準状態。 */
export const Default: Story = {};

/** アイテムなし（空状態）。 */
export const EmptyState: Story = {
  parameters: {
    trpcMocks: {
      'palette.list': [],
      'tags.list': { data: MOCK_TAGS },
      'entries.list': [],
    },
  },
};

/** 全パターン比較。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex gap-8">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Default</p>
        <StoryTRPCProvider mocks={MOCK_TRPC}>
          <Palette />
        </StoryTRPCProvider>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Empty</p>
        <StoryTRPCProvider
          mocks={{ 'palette.list': [], 'tags.list': { data: MOCK_TAGS }, 'entries.list': [] }}
        >
          <Palette />
        </StoryTRPCProvider>
      </div>
    </div>
  ),
};
