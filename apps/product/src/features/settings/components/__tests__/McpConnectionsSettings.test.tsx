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

import { toast } from '@/lib/toast';

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

  it('行ごとの revoke ボタンは、クリックした connection の名前を dialog に表示する（先頭行に固定されない）', async () => {
    const user = userEvent.setup();
    render(<McpConnectionsSettings />);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.chatgpt)' }),
    );

    // dialog インスタンスが 1 つだけであることは「revoke mutation は行数によらず 1 インスタンス
    // だけ生成される」で別途検証済み（getByRole が複数一致で throw する性質は、旧・行ごとの
    // dialog 実装でも closed な dialog は DOM に出ないため「1 つだけ」の証明にはならない）。
    // ここではクリックした行（chatgpt、先頭ではない）の名前が正しく表示されるかだけを見る。
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

  it('revoke 中は全行が disabled になるが、「取り消し中」ラベルは対象行だけに出る（他行に波及しない）', async () => {
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
    const chatgptButton = screen.getByRole('button', {
      name: 'revokeAriaLabel(client=clients.chatgpt)',
      hidden: true,
    });
    const claudeButton = screen.getByRole('button', {
      name: 'revokeAriaLabel(client=clients.claudeAi)',
      hidden: true,
    });
    const cursorButton = screen.getByRole('button', {
      name: 'revokeAriaLabel(client=clients.cursor)',
      hidden: true,
    });

    // mutation は 1 インスタンスを全行で共有しているため、revoke 中は再入防止のため
    // 全行 disabled になる（対象行だけを disabled にすると、他行から新しい revoke を
    // 開始でき、同じ dialog インスタンスが古い isLoading を抱えたまま再オープンされる）。
    expect(chatgptButton).toBeDisabled();
    expect(claudeButton).toBeDisabled();
    expect(cursorButton).toBeDisabled();

    // ただし「取り消し中」ラベルは対象行（chatgpt）だけに出る。他行にまで表示すると、
    // 実際には何も起きていない行が処理中であるかのように誤解させる。
    // getByText は既定で完全一致なので 'revoke' が 'revoking' に部分一致することはない。
    expect(within(chatgptButton).getByText('revoking')).toBeInTheDocument();
    expect(within(claudeButton).getByText('revoke')).toBeInTheDocument();
    expect(within(cursorButton).getByText('revoke')).toBeInTheDocument();
  });

  it('revoke settle 待ち（dialog は既に閉じたが isPending はまだ true）の間、他行は disabled のままで押しても dialog が開かない（再入防止の回帰テスト）', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<McpConnectionsSettings />);

    await user.click(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.chatgpt)' }),
    );

    // 実際の TanStack Query は onSuccess の後も、onSettled の invalidate（network refetch）が
    // 終わるまで isPending を true のまま保つ。ここでは dialog を閉じる onSuccess だけ発火させ、
    // onSettled は呼ばずに isPending=true を維持したまま、そのギャップ区間を再現する。
    mutationState.isPending = true;
    revokeMutationOptions.current?.onSuccess();
    rerender(<McpConnectionsSettings />);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    const claudeButton = screen.getByRole('button', {
      name: 'revokeAriaLabel(client=clients.claudeAi)',
    });
    const cursorButton = screen.getByRole('button', {
      name: 'revokeAriaLabel(client=clients.cursor)',
    });
    expect(claudeButton).toBeDisabled();
    expect(cursorButton).toBeDisabled();

    // disabled ボタンなので押しても dialog は開かない（新しい対象で再入できない）。
    await user.click(claudeButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('revoke 成功時は toast.success を出し dialog を閉じ、一覧を invalidate する', async () => {
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

    expect(toast.success).toHaveBeenCalledWith('revokeSuccess');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(listInvalidate).toHaveBeenCalledOnce();
  });

  it('revoke 失敗時は dialog を閉じずにエラー toast を出す', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<McpConnectionsSettings />);

    await user.click(
      screen.getByRole('button', { name: 'revokeAriaLabel(client=clients.claudeAi)' }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'revoke' }),
    );

    // 実際は mutateAsync が reject して onError が呼ばれる。mock は TanStack Query 内部の
    // コールバック配線までは再現しないため options.onError を明示的に発火させる
    // （onSuccess の既存 test と同じ技法）。setRevokeOpen(false) を onError が呼んでいたら
    // 確実に検出できるよう、明示的に rerender してから DOM を見る
    // （rerender を省くと直近の commit 前の DOM を読んでしまい、この assertion が
    // vacuous になる ── 実際にこの回帰を仕込んで確認済み）。
    revokeMutationOptions.current?.onError();
    rerender(<McpConnectionsSettings />);

    expect(toast.error).toHaveBeenCalledWith('revokeFailed');
    // onError は setRevokeOpen(false) を呼ばない。dialog は開いたままユーザーが
    // 再試行やキャンセルを選べる状態を保つ。
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
