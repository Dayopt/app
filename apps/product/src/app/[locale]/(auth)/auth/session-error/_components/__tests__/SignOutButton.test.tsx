import { fireEvent, render, screen } from '@testing-library/react';
import { IntlErrorCode, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@dayopt/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: mocks.signOut } }),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

// #2144 P2（クロスレビュー指摘）: useLogout は `navigation.navUser.*` キーで
// toastを出すが、(auth)/layout.tsx の AUTH_NAMESPACES にnavigationが無いと
// sign-outボタンを押した瞬間にMISSING_MESSAGEになる。実際に配信される
// namespaceの組み合わせでしか検出できないscoping事故のため、mock next-intl
// ではなく実 next-intl + 実messagesで描画してonErrorを確認する
// （src/components/ui/overlays/__tests__/shortcut-cheat-sheet-dialog.test.tsx
// と同じ手法）。
vi.unmock('next-intl');

import authMessagesEn from '../../../../../../../../messages/en/auth.json';
import commonMessagesEn from '../../../../../../../../messages/en/common.json';
import errorMessagesEn from '../../../../../../../../messages/en/error.json';
import navigationMessagesEn from '../../../../../../../../messages/en/navigation.json';
import { SignOutButton } from '../SignOutButton';

// (auth)/layout.tsx の AUTH_NAMESPACES と同じ組み合わせに限定する。
// ここに navigation を足し忘れると、この test 自体が実際の本番挙動を
// 再現しなくなる（AUTH_NAMESPACES を変えたら同期させる）。
const MESSAGES = {
  ...commonMessagesEn,
  ...authMessagesEn,
  ...errorMessagesEn,
  ...navigationMessagesEn,
};

function renderButton() {
  const onError = vi.fn();
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={MESSAGES} onError={onError}>
      <SignOutButton />
    </NextIntlClientProvider>,
  );
  return onError;
}

function expectNoMissingMessage(onError: ReturnType<typeof vi.fn>) {
  const missing = onError.mock.calls.filter(
    ([error]) => (error as { code?: string }).code === IntlErrorCode.MISSING_MESSAGE,
  );
  expect(missing).toEqual([]);
}

describe('SignOutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unmock('next-intl');
  });

  it('AUTH_NAMESPACES で配信される messages だけで描画できる', () => {
    const onError = renderButton();

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expectNoMissingMessage(onError);
  });

  // #2144 P2: クリックで実際にlogoutが完走し、その過程（成功toast含む）でも
  // MISSING_MESSAGEが起きないことを固定する。ここが抜けていた事故そのもの。
  it('クリックするとMISSING_MESSAGEを起こさずsignOutが完走する', async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    const onError = renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await vi.waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/auth/login');
    });

    expectNoMissingMessage(onError);
  });
});
