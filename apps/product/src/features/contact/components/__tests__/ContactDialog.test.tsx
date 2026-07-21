import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContactCategory } from '../../types';

type DialogSubmission = { category: ContactCategory; message: string };

const mocks = vi.hoisted(() => ({
  contentSubmit: undefined as ((input: DialogSubmission) => void) | undefined,
  mutate: vi.fn(),
}));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/app-info', () => ({ APP_VERSION: 'test-version' }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/trpc', () => ({
  api: {
    contact: {
      submit: { useMutation: () => ({ isPending: false, mutate: mocks.mutate }) },
    },
  },
}));
vi.mock('../../lib/collect-environment', () => ({
  collectEnvironment: () => ({
    appVersion: 'test-version',
    os: 'Test OS',
    browser: 'Test Browser',
    timezone: 'UTC',
    language: 'en',
  }),
}));
vi.mock('../ContactDialogContent', () => ({
  ContactDialogContent: ({ onSubmit }: { onSubmit: (input: DialogSubmission) => void }) => {
    mocks.contentSubmit = onSubmit;
    return null;
  },
}));

import { ContactDialog } from '../ContactDialog';

describe('ContactDialog idempotency contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contentSubmit = undefined;
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('550e8400-e29b-41d4-a716-446655440000')
      .mockReturnValueOnce('650e8400-e29b-41d4-a716-446655440000');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reuses an ID only while the Product contact intent stays unchanged', () => {
    render(<ContactDialog open onOpenChange={vi.fn()} />);

    act(() => mocks.contentSubmit?.({ category: 'bug', message: 'Original private message' }));
    act(() => mocks.contentSubmit?.({ category: 'bug', message: 'Original private message' }));
    act(() => mocks.contentSubmit?.({ category: 'bug', message: 'Edited private message' }));

    const first = mocks.mutate.mock.calls[0]?.[0] as { submissionId: string } | undefined;
    const retry = mocks.mutate.mock.calls[1]?.[0] as { submissionId: string } | undefined;
    const edited = mocks.mutate.mock.calls[2]?.[0] as { submissionId: string } | undefined;

    expect(first?.submissionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(retry?.submissionId).toBe(first?.submissionId);
    expect(edited?.submissionId).toBe('650e8400-e29b-41d4-a716-446655440000');
  });
});
