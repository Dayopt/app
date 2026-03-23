/**
 * PaletteAddPopover Stories
 *
 * パレットへのピン追加ポップオーバー（タグ選択 + duration 選択）。
 * pinnedItems は props 経由。tRPC で tags.list / palette.pin をモック。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';
import { userEvent, within } from 'storybook/test';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { PaletteAddPopover } from './PaletteAddPopover';

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
];

// ─────────────────────────────────────────────────────────
// tRPC モックプロバイダー
// ─────────────────────────────────────────────────────────

function createMockLink(): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const responseMap: Record<string, unknown> = {
            'tags.list': MOCK_TAGS,
          };
          const result = op.path in responseMap ? responseMap[op.path] : [];
          observer.next({ result: { type: 'data', data: result } });
        }
        if (op.type === 'mutation') {
          observer.next({ result: { type: 'data', data: { id: `new-${Date.now()}` } } });
        }
        observer.complete();
      });
}

function MockProvider({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const link = createMockLink();
  const trpcClient = api.createClient({ links: [link] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Palette/PaletteAddPopover',
  component: PaletteAddPopover,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <MockProvider>
        <Story />
      </MockProvider>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof PaletteAddPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 閉じた状態（+ ボタンのみ）。 */
export const Default: Story = {
  args: { pinnedItems: MOCK_PINNED_ITEMS },
};

/** ポップオーバーが開いた状態。 */
export const Opened: Story = {
  args: { pinnedItems: MOCK_PINNED_ITEMS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: /パレットに追加|Add to palette/i });
    await userEvent.click(trigger);
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { pinnedItems: MOCK_PINNED_ITEMS },
  render: (args) => (
    <div className="flex items-start gap-12">
      <div>
        <p className="text-muted-foreground mb-3 text-center text-xs">Closed</p>
        <MockProvider>
          <PaletteAddPopover {...args} />
        </MockProvider>
      </div>
    </div>
  ),
};
