import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  // useMutation に渡された onSuccess/onError を捕まえ、test 側から手動で発火する
  options: undefined as
    | {
        onSuccess?: () => void;
        onError?: (error: unknown) => void;
      }
    | undefined,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// この dialog はパスワード検証と updateUser 実行を server 側（user.requestEmailChange）に
// 一体化した（#2024）。client は supabase.auth を直接呼ばない
vi.mock('@/lib/trpc', () => ({
  api: {
    user: {
      requestEmailChange: {
        useMutation: (options: typeof mocks.options) => {
          mocks.options = options;
          return { mutate: mocks.mutate, isPending: mocks.isPending };
        },
      },
    },
  },
}));

import { EmailChangeDialog } from '../EmailChangeDialog';

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<EmailChangeDialog open onOpenChange={onOpenChange} currentEmail="current@example.com" />);
  return { onOpenChange };
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('settings.account.currentPassword'), 'my-password');
  await user.type(screen.getByLabelText('newEmail'), 'new@example.com');
  await user.click(screen.getByRole('button', { name: 'submit' }));
}

describe('EmailChangeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPending = false;
    mocks.options = undefined;
  });

  it('asks for the current password (in addition to the new email)', () => {
    renderDialog();

    expect(screen.getByLabelText('settings.account.currentPassword')).toBeInTheDocument();
    expect(screen.getByLabelText('newEmail')).toBeInTheDocument();
  });

  it('submits password and newEmail together to the server-side procedure', async () => {
    const user = userEvent.setup();
    renderDialog();

    await submit(user);

    expect(mocks.mutate).toHaveBeenCalledWith({
      password: 'my-password',
      newEmail: 'new@example.com',
    });
  });

  it('shows the success hint once the server confirms both confirmation emails are sent', async () => {
    const user = userEvent.setup();
    renderDialog();

    await submit(user);
    mocks.options?.onSuccess?.();

    await waitFor(() => {
      expect(screen.getByText('successHint')).toBeInTheDocument();
    });
  });

  it('shows a password-specific error when the server reports INVALID_PASSWORD', async () => {
    const user = userEvent.setup();
    renderDialog();

    await submit(user);
    mocks.options?.onError?.({ data: { serviceCode: 'INVALID_PASSWORD' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'settings.account.emailChange.invalidPassword',
      );
    });
  });

  it('shows a rate-limit error when the server reports TOO_MANY_REQUESTS', async () => {
    const user = userEvent.setup();
    renderDialog();

    await submit(user);
    mocks.options?.onError?.({ data: { code: 'TOO_MANY_REQUESTS' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'settings.account.emailChange.rateLimited',
      );
    });
  });

  // EMAIL_UPDATE_FAILED / EMAIL_UPDATE_UNAVAILABLE / REAUTH_UNAVAILABLE / 未知のエラーは
  // すべて汎用文言に畳む（生の GoTrue エラー文言をここに出さない。OWASP サニタイズ）。
  // EMAIL_UPDATE_UNAVAILABLE（#2064、構成故障。server 側で Sentry へは別途報告済み）も
  // 特別扱いしないことをここで固定する
  it.each([
    ['EMAIL_UPDATE_FAILED', { data: { serviceCode: 'EMAIL_UPDATE_FAILED' } }],
    ['EMAIL_UPDATE_UNAVAILABLE', { data: { serviceCode: 'EMAIL_UPDATE_UNAVAILABLE' } }],
    ['REAUTH_UNAVAILABLE', { data: { serviceCode: 'REAUTH_UNAVAILABLE' } }],
    ['serviceCode を持たない未知のエラー', { data: {} }],
  ])('falls back to a generic error for %s', async (_label, error) => {
    const user = userEvent.setup();
    renderDialog();

    await submit(user);
    mocks.options?.onError?.(error);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('common.errors.generic');
    });
  });
});
