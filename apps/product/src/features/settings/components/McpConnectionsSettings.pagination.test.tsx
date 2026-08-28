import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 「もっと見る」→ revoke → 再取得の配線を **実 QueryClient** で通す test（#1909 / Codex P2）。
 *
 * 同ディレクトリの `McpConnectionsSettings.test.tsx` は `useInfiniteQuery` の戻り値を
 * 固定値で mock するため、cache に載った pages を描くところまでしか観測できない。
 * そのため「revoke → invalidate → 1 ページ目から再取得 → **更新後の** cursor で 2 ページ目」
 * という往復が壊れていても成功してしまう（stale cursor の再利用で行が重複・欠落する）。
 *
 * ここでは TanStack Query の本物の cache / 再取得ループを動かし、
 * **queryFn が受け取った cursor の列**と**最終 UI** の両方を assert する。
 *
 * なお fake server は cursor の意味論（`(authorized_at, id)` の降順で「次を取る」）を
 * 再実装しているので、**server 側の意味論の正しさはここでは証明していない**。
 * それは実 PostgREST に対する `mcp-connections-list-cursor.integration.test.ts` の担当。
 * この test が担保するのは client 側の配線（cursor を誰がどう次の要求へ渡すか）だけ。
 */

type Cursor = { authorizedAt: string; id: string };
type Row = {
  id: string;
  client_id: string;
  scopes: string[];
  authorized_at: string;
  last_used_at: string | null;
};

// 1 ページ 1 件にすると「何ページ目をどの cursor で取ったか」が 1:1 で読めるので、
// pageParam の再計算漏れ（stale cursor の再利用）が request 列にそのまま現れる。
const PAGE_SIZE = 1;

const CLAUDE: Row = {
  id: 'conn-claude',
  client_id: 'claude-ai',
  scopes: ['read:entries'],
  authorized_at: '2026-08-03T00:00:00.000000Z',
  last_used_at: null,
};
const CHATGPT: Row = {
  id: 'conn-chatgpt',
  client_id: 'chatgpt',
  scopes: ['read:activities'],
  authorized_at: '2026-08-02T00:00:00.000000Z',
  last_used_at: null,
};
const CURSOR_CLIENT: Row = {
  id: 'conn-cursor',
  client_id: 'cursor',
  scopes: ['write:plans'],
  authorized_at: '2026-08-01T00:00:00.000000Z',
  last_used_at: null,
};

/** cursor に応じて実際に応答を変える fake server（要求された cursor を記録する）。 */
const server = vi.hoisted(() => {
  const state = {
    rows: [] as Array<{
      id: string;
      client_id: string;
      scopes: string[];
      authorized_at: string;
      last_used_at: string | null;
    }>,
    /** queryFn が受け取った cursor の列。null = 1 ページ目。 */
    requests: [] as Array<{ authorizedAt: string; id: string } | null>,
  };

  function fetchPage(cursor: { authorizedAt: string; id: string } | null) {
    state.requests.push(cursor);

    const ordered = [...state.rows].sort((a, b) =>
      a.authorized_at === b.authorized_at
        ? b.id.localeCompare(a.id)
        : b.authorized_at.localeCompare(a.authorized_at),
    );
    const remaining = cursor
      ? ordered.filter(
          (row) =>
            row.authorized_at < cursor.authorizedAt ||
            (row.authorized_at === cursor.authorizedAt && row.id < cursor.id),
        )
      : ordered;

    const slice = remaining.slice(0, PAGE_SIZE + 1);
    const hasMore = slice.length > PAGE_SIZE;
    const items = hasMore ? slice.slice(0, PAGE_SIZE) : slice;
    const last = items[items.length - 1];

    return Promise.resolve({
      items,
      nextCursor: hasMore && last ? { authorizedAt: last.authorized_at, id: last.id } : null,
    });
  }

  function revoke(connectionId: string) {
    state.rows = state.rows.filter((row) => row.id !== connectionId);
    return Promise.resolve({ success: true as const });
  }

  return { state, fetchPage, revoke };
});

vi.mock('next-intl', () => ({
  useLocale: () => 'ja',
  useTranslations:
    () =>
    (key: string, values?: Record<string, string>): string =>
      values
        ? `${key}(${Object.entries(values)
            .map(([name, value]) => `${name}=${value}`)
            .join(',')})`
        : key,
}));

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * tRPC の層だけを差し替え、その下の TanStack Query は本物を使う。
 * cache・invalidate・infinite query の再取得ループはすべて実装が動く。
 */
vi.mock('@/lib/trpc', async () => {
  const { useInfiniteQuery, useMutation, useQueryClient } = await import('@tanstack/react-query');
  const LIST_KEY = ['mcpConnections', 'list'];

  return {
    api: {
      useUtils: () => {
        const queryClient = useQueryClient();
        return {
          mcpConnections: {
            list: {
              cancel: () => queryClient.cancelQueries({ queryKey: LIST_KEY }),
              invalidate: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
            },
          },
        };
      },
      mcpConnections: {
        list: {
          useInfiniteQuery: (
            _input: unknown,
            options: {
              initialCursor: Cursor | null;
              getNextPageParam: (lastPage: {
                items: Row[];
                nextCursor: Cursor | null;
              }) => Cursor | undefined;
              retry: boolean;
              refetchOnMount: 'always';
            },
          ) =>
            useInfiniteQuery({
              queryKey: LIST_KEY,
              queryFn: ({ pageParam }) => server.fetchPage(pageParam as Cursor | null),
              initialPageParam: options.initialCursor,
              // component が渡す実装をそのまま使う（ここを差し替えると配線を検証できない）。
              getNextPageParam: options.getNextPageParam,
              retry: options.retry,
              refetchOnMount: options.refetchOnMount,
            }),
        },
        revoke: {
          useMutation: (options: Record<string, unknown>) =>
            useMutation({
              mutationFn: (variables: { connectionId: string }) =>
                server.revoke(variables.connectionId),
              ...options,
            }),
        },
      },
    },
  };
});

import { McpConnectionsSettings } from './McpConnectionsSettings';

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <McpConnectionsSettings />
    </QueryClientProvider>,
  );
}

const revokeButton = (client: string) => ({
  name: `revokeAriaLabel(client=clients.${client})`,
});

describe('McpConnectionsSettings pagination (real QueryClient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.state.rows = [CLAUDE, CHATGPT, CURSOR_CLIENT];
    server.state.requests = [];
  });

  it('「もっと見る」は直前ページの nextCursor で次ページを要求し、行を積み増す', async () => {
    const user = userEvent.setup();
    renderWithClient();

    // 1 ページ目は cursor 無しで取る。
    expect(await screen.findByRole('button', revokeButton('claudeAi'))).toBeInTheDocument();
    expect(server.state.requests).toEqual([null]);
    expect(screen.queryByRole('button', revokeButton('chatgpt'))).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'loadMore' }));

    // 2 ページ目は 1 ページ目の最終行（claude）を指す cursor で取る。
    expect(await screen.findByRole('button', revokeButton('chatgpt'))).toBeInTheDocument();
    expect(server.state.requests).toEqual([
      null,
      { authorizedAt: CLAUDE.authorized_at, id: CLAUDE.id },
    ]);
    // 既読ページは残ったまま積み増される。
    expect(screen.getByRole('button', revokeButton('claudeAi'))).toBeInTheDocument();
  });

  it('revoke 後の再取得は 1 ページ目からやり直し、更新後の cursor で 2 ページ目を取る（stale cursor を再利用しない）', async () => {
    const user = userEvent.setup();
    renderWithClient();

    await screen.findByRole('button', revokeButton('claudeAi'));
    await user.click(screen.getByRole('button', { name: 'loadMore' }));
    await screen.findByRole('button', revokeButton('chatgpt'));

    server.state.requests = []; // ここから先（revoke 起因の再取得）だけを見る
    await user.click(screen.getByRole('button', revokeButton('claudeAi')));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'revoke' }),
    );

    // 先頭ページの claude が消えるので、2 ページ目の cursor は chatgpt を指す値へ更新される。
    // stale cursor（claude）を再利用すると chatgpt を 2 度返して cursor が重複描画される。
    await waitFor(() => {
      expect(server.state.requests).toEqual([
        null,
        { authorizedAt: CHATGPT.authorized_at, id: CHATGPT.id },
      ]);
    });

    // 最終 UI: revoke した行は消え、残り 2 件が 1 度ずつ出る（重複・欠落なし）。
    await waitFor(() => {
      expect(screen.queryByRole('button', revokeButton('claudeAi'))).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', revokeButton('chatgpt'))).toHaveLength(1);
    expect(screen.getAllByRole('button', revokeButton('cursor'))).toHaveLength(1);
  });

  it('2 ページ既読のまま revoke しても、繰り上がった行が二重に現れない', async () => {
    // 上の test の「重複しない」側を、行の総数という別の観測でも固定する。
    const user = userEvent.setup();
    renderWithClient();

    await screen.findByRole('button', revokeButton('claudeAi'));
    await user.click(screen.getByRole('button', { name: 'loadMore' }));
    await screen.findByRole('button', revokeButton('chatgpt'));

    await user.click(screen.getByRole('button', revokeButton('claudeAi')));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'revoke' }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', revokeButton('claudeAi'))).not.toBeInTheDocument();
    });

    const allRevokeButtons = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-label')?.startsWith('revokeAriaLabel'));
    expect(allRevokeButtons).toHaveLength(2);
  });
});
