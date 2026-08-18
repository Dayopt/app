import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #1909 フォローアップ実指摘（2026-08-10）:
 *
 * revoke 成功時 / cancel 時に dialog を閉じる際、対象 connection への参照まで一緒に
 * null へ戻すと、`ConfirmDialog`（Radix `AlertDialogContent`）が `data-[state=closed]` の
 * exit animation（fade-out + zoom-out、packages/components/src/overlays/alert-dialog.tsx）の
 * 間もマウントされ続ける Presence の仕組み上、title / description がその間だけ
 * 空の client 名（「」）で再描画されてしまう。旧・行ごとの dialog では `connection` が
 * closure に残り続けるため起きなかった回帰。
 *
 * happy-dom には実 CSS engine が無く `getComputedStyle().animationName` が常に `'none'` を
 * 返すため、`@radix-ui/react-presence` はこの test 環境では exit animation を検出できず
 * 即座に unmount する（Presence の useLayoutEffect 参照）。そのためフェードアウト中の DOM を
 * RTL のロール/テキストクエリで直接観測することはできない。代わりに `ConfirmDialog` を
 * 「渡された props をそのまま可視化するだけ」の薄い mock に差し替え、
 * `McpConnectionsSettings` が open=false になった直後の render で渡す title に
 * 対象 connection の名前が残っているかを props レベルで直接検証する。
 */

type ConnectionFixture = {
  id: string;
  client_id: string;
  scopes: string[];
  authorized_at: string;
  last_used_at: string | null;
};

const CLAUDE_CONNECTION: ConnectionFixture = {
  id: 'conn-claude',
  client_id: 'claude-ai',
  scopes: ['read:entries'],
  authorized_at: '2026-08-01T00:00:00.000Z',
  last_used_at: '2026-08-05T00:00:00.000Z',
};

const CHATGPT_CONNECTION: ConnectionFixture = {
  id: 'conn-chatgpt',
  client_id: 'chatgpt',
  scopes: ['read:activities'],
  authorized_at: '2026-07-20T00:00:00.000Z',
  last_used_at: null,
};

const rowsState = vi.hoisted(() => ({ value: [] as ConnectionFixture[] }));
const revokeMutateAsync = vi.hoisted(() => vi.fn());
const listCancel = vi.hoisted(() => vi.fn());
const listInvalidate = vi.hoisted(() => vi.fn());
const listRefetch = vi.hoisted(() => vi.fn());
const revokeMutationOptions = vi.hoisted(
  () =>
    ({ current: null }) as {
      current: null | {
        onMutate: () => Promise<void>;
        onSuccess: () => void;
        onError: () => void;
        onSettled: () => Promise<void>;
      };
    },
);
/** McpConnectionsSettings が直近の render で ConfirmDialog へ渡した props のスナップショット。 */
const lastDialogProps = vi.hoisted(
  () =>
    ({ current: null }) as {
      // description は exactOptionalPropertyTypes 下で `string | undefined` を明示する
      // （`description?: string` にすると props.description の代入が型エラーになる）。
      current: null | { open: boolean; title: string; description: string | undefined };
    },
);

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

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    useUtils: () => ({
      mcpConnections: { list: { cancel: listCancel, invalidate: listInvalidate } },
    }),
    mcpConnections: {
      list: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: rowsState.value, nextCursor: null }] },
          isLoading: false,
          isError: false,
          // このテストは dialog の label 保持だけを見るので、query は常に成功状態にする。
          // 各 error flag の従属関係（isFetchNextPageError ⊂ isError）は
          // McpConnectionsSettings.test.tsx の deriveQueryFlags 側で固定している。
          isLoadingError: false,
          isRefetchError: false,
          hasNextPage: false,
          isFetchingNextPage: false,
          isFetchNextPageError: false,
          fetchNextPage: vi.fn(),
          refetch: listRefetch,
        }),
      },
      revoke: {
        useMutation: (options: NonNullable<typeof revokeMutationOptions.current>) => {
          revokeMutationOptions.current = options;
          return { mutateAsync: revokeMutateAsync, isPending: false };
        },
      },
    },
  },
}));

// ConfirmDialog を「渡された props をそのまま可視化するだけ」の薄い mock に差し替える。
// 目的は Radix Presence のフェードアウト演出そのものの再現ではなく、close 中も
// McpConnectionsSettings が正しい label を渡し続けているかを props レベルで直接見ること。
vi.mock('@/components/ui/overlays/confirm-dialog', () => ({
  ConfirmDialog: (props: {
    open: boolean;
    title: string;
    description?: string;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
  }) => {
    lastDialogProps.current = {
      open: props.open,
      title: props.title,
      description: props.description,
    };
    return (
      <div data-testid="mock-confirm-dialog" data-open={props.open}>
        <h2>{props.title}</h2>
        {props.description ? <p>{props.description}</p> : null}
        <button type="button" onClick={props.onClose}>
          mock-cancel
        </button>
        <button type="button" onClick={() => void props.onConfirm()}>
          mock-confirm
        </button>
      </div>
    );
  },
}));

import { McpConnectionsSettings } from '../McpConnectionsSettings';

describe('McpConnectionsSettings: dialog close 中の client label 保持', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowsState.value = [CLAUDE_CONNECTION, CHATGPT_CONNECTION];
    revokeMutationOptions.current = null;
    lastDialogProps.current = null;
    revokeMutateAsync.mockResolvedValue({ success: true });
    listCancel.mockResolvedValue(undefined);
    listInvalidate.mockResolvedValue(undefined);
  });

  it('revoke 成功で close した直後も、title は対象 connection の名前を保持したままになる（空文字に戻らない）', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<McpConnectionsSettings />);

    await user.click(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.chatgpt)' }),
    );
    expect(lastDialogProps.current).toMatchObject({
      open: true,
      title: 'revokeDialog.title(client=clients.chatgpt)',
    });

    await user.click(screen.getByRole('button', { name: 'mock-confirm' }));

    // mutateAsync 自体は resolve するが、mock は TanStack Query 内部の onSuccess 配線までは
    // 再現しないため options を明示的に発火させる（既存の成功 test と同じ技法）。
    revokeMutationOptions.current?.onSuccess();
    rerender(<McpConnectionsSettings />);

    // open は false に切り替わったが、title は revokeTarget（chatgpt）の名前を保持したまま。
    // ここが 'revokeDialog.title(client=)'（空の client 名）に戻っていたら回帰。
    expect(lastDialogProps.current).toMatchObject({
      open: false,
      title: 'revokeDialog.title(client=clients.chatgpt)',
    });
  });

  it('cancel で close した直後も、title は対象 connection の名前を保持したままになる（空文字に戻らない）', async () => {
    const user = userEvent.setup();
    render(<McpConnectionsSettings />);

    await user.click(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.claudeAi)' }),
    );
    expect(lastDialogProps.current).toMatchObject({
      open: true,
      title: 'revokeDialog.title(client=clients.claudeAi)',
    });

    await user.click(screen.getByRole('button', { name: 'mock-cancel' }));

    expect(revokeMutateAsync).not.toHaveBeenCalled();
    expect(lastDialogProps.current).toMatchObject({
      open: false,
      title: 'revokeDialog.title(client=clients.claudeAi)',
    });
  });
});
