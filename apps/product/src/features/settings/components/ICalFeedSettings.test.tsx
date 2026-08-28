import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokenState = vi.hoisted(() => ({ value: 'private-token' as string | null }));
const queryState = vi.hoisted(() => ({ isLoading: false, isFetching: false, isError: false }));
const regenerate = vi.hoisted(() => vi.fn());
const regenerateAsync = vi.hoisted(() => vi.fn());
const refetch = vi.hoisted(() => vi.fn());
const invalidate = vi.hoisted(() => vi.fn());
const queryOptions = vi.hoisted(
  () =>
    ({ current: null }) as {
      current: null | {
        retry: boolean;
        refetchOnMount: string;
        refetchOnWindowFocus: string;
        meta: { persist: boolean };
      };
    },
);
const mutationOptions = vi.hoisted(
  () =>
    ({ current: null }) as {
      current: null | {
        onSuccess: () => void;
        onError: () => void;
        onSettled: () => Promise<void>;
      };
    },
);

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    useUtils: () => ({ userSettings: { getICalToken: { invalidate } } }),
    userSettings: {
      getICalToken: {
        useQuery: (_input: undefined, options: NonNullable<typeof queryOptions.current>) => {
          queryOptions.current = options;
          return {
            data: { token: tokenState.value },
            ...queryState,
            refetch,
          };
        },
      },
      regenerateICalToken: {
        useMutation: (options: NonNullable<typeof mutationOptions.current>) => {
          mutationOptions.current = options;
          return {
            mutate: regenerate,
            mutateAsync: regenerateAsync,
            isPending: false,
          };
        },
      },
    },
  },
}));

import { ICalFeedSettings } from './ICalFeedSettings';

describe('ICalFeedSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenState.value = 'private-token';
    queryState.isLoading = false;
    queryState.isFetching = false;
    queryState.isError = false;
    queryOptions.current = null;
    mutationOptions.current = null;
    regenerateAsync.mockResolvedValue({ token: 'new-token' });
    refetch.mockResolvedValue({ data: { token: tokenState.value } });
    invalidate.mockResolvedValue(undefined);
  });

  it('既存 token の再生成は確認するまで mutation を呼ばない', async () => {
    const user = userEvent.setup();
    render(<ICalFeedSettings />);

    await user.click(screen.getByRole('button', { name: 'regenerate' }));

    expect(regenerate).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('regenerateConfirmDescription')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'regenerate' }));
    expect(regenerateAsync).toHaveBeenCalledOnce();
  });

  it('token が無い legacy 状態では確認なしで生成する', async () => {
    tokenState.value = null;
    const user = userEvent.setup();
    render(<ICalFeedSettings />);

    await user.click(screen.getByRole('button', { name: 'generate' }));

    expect(regenerate).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('bearer token を永続化せず、mount / focus で常に authoritative refetch する', () => {
    render(<ICalFeedSettings />);

    expect(queryOptions.current).toMatchObject({
      retry: false,
      refetchOnMount: 'always',
      refetchOnWindowFocus: 'always',
      meta: { persist: false },
    });
  });

  it('cached token の再取得中は古い URL と操作を表示しない', () => {
    queryState.isFetching = true;
    render(<ICalFeedSettings />);

    expect(screen.getByLabelText('loading')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'feedUrl' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'copy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'regenerate' })).not.toBeInTheDocument();
  });

  it('現在 origin の完全な feed URL を表示して clipboard へコピーする', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<ICalFeedSettings />);
    const expected = `${window.location.origin}/api/v1/calendar/private-token.ics`;

    expect(screen.getByRole('textbox', { name: 'feedUrl' })).toHaveValue(expected);
    await user.click(screen.getByRole('button', { name: 'copy' }));
    expect(writeText).toHaveBeenCalledWith(expected);
  });

  it('再生成後は query を再取得し、旧 URL ではなく新 token を表示する', async () => {
    const { rerender } = render(<ICalFeedSettings />);
    tokenState.value = 'new-token';
    refetch.mockResolvedValue({ data: { token: 'new-token' } });

    mutationOptions.current?.onSuccess();
    await mutationOptions.current?.onSettled();
    rerender(<ICalFeedSettings />);

    expect(invalidate).toHaveBeenCalledOnce();
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox', { name: 'feedUrl' })).toHaveValue(
      `${window.location.origin}/api/v1/calendar/new-token.ics`,
    );
  });
});
