import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * 削除 mutation が自動リトライされないことを固定する（#1925）
 *
 * `query-client.ts` の mutation 既定は「auth error でなければ 1 回リトライ」。
 * `INVALID_PASSWORD` は以前 `UNAUTHORIZED` へ写像されていたため `isAuthError` に
 * 拾われて retry 0 だったが、ログイン画面への強制遷移を止めるため `FORBIDDEN` へ
 * 移した結果、**既定のままだとリトライされる**ようになった。
 *
 * リトライされると、レート制限で詰まっている最中にもう 1 発撃ち、GoTrue の
 * 共有 IP バケットを二重に消費する（`docs/product/specs/auth.md` 参照）。
 * 不可逆操作に自動リトライが付くこと自体も危うい。
 *
 * `query-client.ts` 側で「4xx は一律リトライしない」に広げる案は採らない。
 * `RETRYABLE_CONTENTION` が `CONFLICT`（4xx）へ写像されており、**再試行前提の
 * code まで殺してしまう**ため。したがって no-retry はこの 1 行に依存する。
 * 依存を暗黙にしないよう、ここで契約として固定する。
 */

const useMutationOptions = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

vi.mock('@/lib/trpc', () => ({
  api: {
    user: {
      deleteAccount: {
        useMutation: (options: unknown) => {
          useMutationOptions.current = options;
          return { mutate: vi.fn(), isPending: false };
        },
      },
    },
  },
}));

vi.mock('@/features/auth', () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
  hasPasswordIdentity: () => false,
  hasVerifiedMfaFactor: () => false,
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));
vi.mock('@/lib/sentry', () => ({
  observeAuthOperation: (_o: string, call: () => unknown) => call(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AccountDeletionDialog } from '../AccountDeletionDialog';

describe('AccountDeletionDialog の削除 mutation', () => {
  it('自動リトライしない（共有レート制限の二重消費と不可逆操作の再送を防ぐ）', () => {
    render(<AccountDeletionDialog />);

    expect(useMutationOptions.current).toMatchObject({ retry: false });
  });
});
