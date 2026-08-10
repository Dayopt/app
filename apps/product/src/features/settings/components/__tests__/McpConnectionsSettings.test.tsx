import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #1909: N connections だった行数分 `ConfirmDialog` / `useMutation` を mount していたのを
 * 1 つに集約した。ここでは黒箱の DOM 観測では見えない「mutation hook は 1 インスタンスだけ
 * 生成されるか」を明示的にカウントし、行ごとの pending 表示が対象行だけに閉じることを検証する。
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
  scopes: ['read:tags'],
  authorized_at: '2026-07-20T00:00:00.000Z',
  last_used_at: null,
};

const CURSOR_CONNECTION: ConnectionFixture = {
  id: 'conn-cursor',
  client_id: 'cursor',
  scopes: ['write:plans'],
  authorized_at: '2026-06-02T00:00:00.000Z',
  last_used_at: '2026-08-08T00:00:00.000Z',
};

const rowsState = vi.hoisted(() => ({ value: [] as ConnectionFixture[] }));
const mutationState = vi.hoisted(() => ({ isPending: false }));
const revokeUseMutationCallCount = vi.hoisted(() => ({ value: 0 }));
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

vi.mock('next-intl', () => ({
  useLocale: () => 'ja',
  // key + interpolation 値をそのまま連結する簡易 mock。実文言ではなく「どの key に何の値が
  // 渡ったか」を assertion で見分けられれば十分（実文言の検証は Storybook / i18n skill の領域）。
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
        useQuery: () => ({
          data: rowsState.value,
          isLoading: false,
          isError: false,
          refetch: listRefetch,
        }),
      },
      revoke: {
        useMutation: (options: NonNullable<typeof revokeMutationOptions.current>) => {
          revokeUseMutationCallCount.value += 1;
          revokeMutationOptions.current = options;
          return {
            mutateAsync: revokeMutateAsync,
            isPending: mutationState.isPending,
          };
        },
      },
    },
  },
}));

import { McpConnectionsSettings } from '../McpConnectionsSettings';

describe('McpConnectionsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowsState.value = [CLAUDE_CONNECTION, CHATGPT_CONNECTION, CURSOR_CONNECTION];
    mutationState.isPending = false;
    revokeUseMutationCallCount.value = 0;
    revokeMutationOptions.current = null;
    revokeMutateAsync.mockResolvedValue({ success: true });
    listCancel.mockResolvedValue(undefined);
    listInvalidate.mockResolvedValue(undefined);
  });

  it('revoke mutation は行数によらず 1 インスタンスだけ生成される', () => {
    render(<McpConnectionsSettings />);

    expect(revokeUseMutationCallCount.value).toBe(1);
  });

  it('行ごとの revoke ボタンは、クリックした connection の名前で単一 dialog を開く', async () => {
    const user = userEvent.setup();
    render(<McpConnectionsSettings />);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.chatgpt)' }),
    );

    // getByRole は一致が複数あると throw するため、これ自体が「dialog は 1 つだけ」の証跡になる。
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByText('revokeDialog.title(client=clients.chatgpt)'),
    ).toBeInTheDocument();
  });

  it('確認すると、開いた行の connectionId で revoke する（先頭行に固定されない）', async () => {
    const user = userEvent.setup();
    render(<McpConnectionsSettings />);

    await user.click(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.cursor)' }),
    );
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'revoke' }));

    expect(revokeMutateAsync).toHaveBeenCalledOnce();
    expect(revokeMutateAsync).toHaveBeenCalledWith({ connectionId: CURSOR_CONNECTION.id });
  });

  it('キャンセルすると mutation を呼ばずに dialog を閉じる', async () => {
    const user = userEvent.setup();
    render(<McpConnectionsSettings />);

    await user.click(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.claudeAi)' }),
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'common.actions.cancel',
      }),
    );

    expect(revokeMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('revoke 中は対象行だけ pending になり、他行は操作可能なまま（全行 pending への回帰防止）', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<McpConnectionsSettings />);

    await user.click(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.chatgpt)' }),
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // 実際の flow では confirm 後に revoke.isPending が true になる。ここでは mutation の
    // 解決を待たず、pending 中の再 render だけを再現する。
    mutationState.isPending = true;
    rerender(<McpConnectionsSettings />);

    // dialog が open の間、背後の行は Radix によって aria-hidden になる（フォーカストラップ /
    // スクリーンリーダー除外の正しい挙動）。disabled 属性そのものは意味を持ち続けるため
    // `hidden: true` で accessibility tree から見えない要素も対象に含める。
    expect(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.chatgpt)', hidden: true }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'revokeAriaLabel(client=clients.claudeAi)',
        hidden: true,
      }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.cursor)', hidden: true }),
    ).not.toBeDisabled();
  });

  it('revoke 成功時は toast を出し dialog を閉じ、一覧を invalidate する', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<McpConnectionsSettings />);

    await user.click(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.claudeAi)' }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'revoke' }),
    );

    // mutateAsync 自体は resolve するが、mock は TanStack Query 内部の
    // onSuccess/onSettled 配線までは再現しないため、useMutation に渡された options を
    // 明示的に発火させて検証する（ICalFeedSettings.test.tsx と同じ技法）。
    revokeMutationOptions.current?.onSuccess();
    await revokeMutationOptions.current?.onSettled();
    rerender(<McpConnectionsSettings />);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(listInvalidate).toHaveBeenCalledOnce();
  });
});
