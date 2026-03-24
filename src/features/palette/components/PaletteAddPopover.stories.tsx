/**
 * PaletteAddPopover Stories
 *
 * パレットへのピン追加フローティングパネル（タグ選択 + duration 選択）。
 * pinnedItems は props 経由。tRPC で tags.list / palette.pin をモック。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { userEvent, within } from 'storybook/test';

import { Button } from '@/components/ui/button';
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
// Wrapper（トリガーボタン + ポップオーバーを一緒に描画）
// ─────────────────────────────────────────────────────────

function PaletteAddDemo({ pinnedItems }: { pinnedItems?: typeof MOCK_PINNED_ITEMS }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button ref={buttonRef} variant="outline" onClick={() => setOpen(true)}>
        パレットに追加
      </Button>
      <PaletteAddPopover
        open={open}
        onOpenChange={setOpen}
        anchorRef={buttonRef}
        pinnedItems={pinnedItems}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Palette/AddPopover',
  component: PaletteAddDemo,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <MockProvider>
        <Story />
      </MockProvider>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof PaletteAddDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** トリガーボタン + フローティングパネルの基本表示。 */
export const Default: Story = {
  render: () => <PaletteAddDemo pinnedItems={MOCK_PINNED_ITEMS} />,
};

/** ボタンクリックでパネルが開いた状態。 */
export const Opened: Story = {
  render: () => <PaletteAddDemo pinnedItems={MOCK_PINNED_ITEMS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: /パレットに追加/i });
    await userEvent.click(trigger);
  },
};

/** 重複エラー状態（既にピン済みのタグ+duration を選択）。 */
export const DuplicateError: Story = {
  render: () => <PaletteAddDemo pinnedItems={MOCK_PINNED_ITEMS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // パネルを開く
    await userEvent.click(canvas.getByRole('button', { name: /パレットに追加/i }));
    // タグ選択: 「仕事」（tag-work）
    const tagTrigger =
      document.querySelector<HTMLElement>('[aria-label="タグ"]') ??
      document.querySelectorAll('[role="combobox"]')[0];
    if (tagTrigger) {
      await userEvent.click(tagTrigger);
      const workOption = await within(document.body).findByText('仕事');
      await userEvent.click(workOption);
    }
    // Duration 選択: 1h (60min) — ピン済みと一致
    const durationTrigger =
      document.querySelectorAll('[role="combobox"]')[1] ??
      document.querySelector<HTMLElement>('[aria-label="時間"]');
    if (durationTrigger) {
      await userEvent.click(durationTrigger);
      const oneHourOption = await within(document.body).findByText('1h');
      await userEvent.click(oneHourOption);
    }
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex items-start gap-12">
      <div>
        <p className="text-muted-foreground mb-3 text-center text-xs">Trigger</p>
        <PaletteAddDemo pinnedItems={MOCK_PINNED_ITEMS} />
      </div>
    </div>
  ),
};
