import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * メール変更 mutation が自動リトライされないことを固定する（#2024）
 *
 * `query-client.ts` の mutation 既定は「auth error でなければ 1 回リトライ」。
 * `INVALID_PASSWORD` は `FORBIDDEN` へ写像されており `isAuthError` に拾われないため、
 * 既定のままだとパスワード誤りのたびに自動で 2 回撃つ。reauth 専用 rate limit
 * （5回/10分）を 1 回の誤入力で 2 消費し、GoTrue の共有 IP バケットも二重に叩く
 * （`AccountDeletionDialog.retry.test.tsx` と同じ理由。#1925 の教訓の再発）。
 */

const useMutationOptions = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

vi.mock('@/lib/trpc', () => ({
  api: {
    user: {
      requestEmailChange: {
        useMutation: (options: unknown) => {
          useMutationOptions.current = options;
          return { mutate: vi.fn(), isPending: false };
        },
      },
    },
  },
}));

import { EmailChangeDialog } from './EmailChangeDialog';

describe('EmailChangeDialog のメール変更 mutation', () => {
  it('自動リトライしない（reauth rate limit の二重消費を防ぐ）', () => {
    render(<EmailChangeDialog open onOpenChange={vi.fn()} currentEmail="current@example.com" />);

    expect(useMutationOptions.current).toMatchObject({ retry: false });
  });
});
