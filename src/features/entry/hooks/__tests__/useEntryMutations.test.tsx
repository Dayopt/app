/**
 * useEntryMutations 回帰テスト
 *
 * 戦略: api.entries.{name}.useMutation を mock して mutation options（onMutate /
 * onSuccess / onError / onSettled）をキャプチャし、各 lifecycle handler を直接
 * 呼び出して挙動を検証する。tRPC transport は触らず、楽観的更新ロジック・
 * rollback・toast 配線・Inspector 連携のみを isolate してテストする。
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

type Handlers = {
  onMutate?: (input: unknown) => Promise<unknown> | unknown;
  onSuccess?: (data: unknown, input: unknown, ctx: unknown) => unknown;
  onError?: (err: unknown, input: unknown, ctx: unknown) => unknown;
  onSettled?: (data: unknown, err: unknown, input: unknown, ctx: unknown) => unknown;
};
const captured: Record<string, Handlers> = {};

const mutateMocks: Record<string, ReturnType<typeof vi.fn>> = {};

const utilsMock = {
  entries: {
    list: {
      cancel: vi.fn().mockResolvedValue(undefined),
      invalidate: vi.fn().mockResolvedValue(undefined),
      getData: vi.fn(),
      setData: vi.fn(),
      fetch: vi.fn(),
    },
    getById: {
      cancel: vi.fn().mockResolvedValue(undefined),
      invalidate: vi.fn().mockResolvedValue(undefined),
      getData: vi.fn(),
      setData: vi.fn(),
    },
    getTagStats: {
      invalidate: vi.fn().mockResolvedValue(undefined),
    },
  },
};

vi.mock('@/lib/trpc', () => {
  const makeMutation = (name: string) => ({
    useMutation: (opts: Handlers) => {
      captured[name] = opts;
      const mutate = vi.fn();
      mutateMocks[name] = mutate;
      return { mutate, mutateAsync: vi.fn() };
    },
  });

  return {
    api: {
      entries: {
        create: makeMutation('create'),
        update: makeMutation('update'),
        delete: makeMutation('delete'),
        restore: makeMutation('restore'),
        bulkUpdate: makeMutation('bulkUpdate'),
        bulkDelete: makeMutation('bulkDelete'),
        bulkAddTags: makeMutation('bulkAddTags'),
      },
      useUtils: () => utilsMock,
    },
  };
});

const closeInspector = vi.fn();
const openInspector = vi.fn();
vi.mock('../../stores/useEntryInspectorStore', () => ({
  useEntryInspectorStore: (
    selector: (state: {
      closeInspector: typeof closeInspector;
      openInspector: typeof openInspector;
    }) => unknown,
  ) => selector({ closeInspector, openInspector }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const markNew = vi.fn();
const clearNew = vi.fn();
vi.mock('../../lib/new-entry-tracker', () => ({
  markNew: (...args: unknown[]) => markNew(...args),
  clearNew: (...args: unknown[]) => clearNew(...args),
}));

const { useEntryMutations } = await import('../useEntryMutations');

// =============================================================================
// Test scaffolding
// =============================================================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

function renderUseEntryMutations(options?: { suppressCreateToast?: boolean }) {
  const { queryClient, wrapper } = createWrapper();
  const { result } = renderHook(() => useEntryMutations(options), { wrapper });
  return { queryClient, result };
}

const LIST_KEY = [['entries', 'list']];

function seedList(queryClient: QueryClient, entries: Array<Record<string, unknown>>) {
  queryClient.setQueryData(LIST_KEY, entries);
}

beforeEach(() => {
  Object.keys(captured).forEach((k) => delete captured[k]);
  Object.values(mutateMocks).forEach((m) => m.mockReset());
  Object.values(utilsMock.entries.list).forEach((fn) => 'mockReset' in fn && fn.mockReset?.());
  Object.values(utilsMock.entries.getById).forEach((fn) => 'mockReset' in fn && fn.mockReset?.());
  utilsMock.entries.list.cancel.mockResolvedValue(undefined);
  utilsMock.entries.list.invalidate.mockResolvedValue(undefined);
  utilsMock.entries.getById.cancel.mockResolvedValue(undefined);
  utilsMock.entries.getById.invalidate.mockResolvedValue(undefined);
  utilsMock.entries.getTagStats.invalidate.mockResolvedValue(undefined);
  closeInspector.mockReset();
  openInspector.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  markNew.mockReset();
  clearNew.mockReset();
});

// =============================================================================
// createEntry
// =============================================================================

describe('useEntryMutations.createEntry', () => {
  it('onMutate: temp entry を list cache に insert し markNew を呼ぶ', async () => {
    const { queryClient } = renderUseEntryMutations();
    seedList(queryClient, [{ id: 'existing', title: 'Existing' }]);

    const ctx = (await captured.create!.onMutate!({
      title: 'New',
      start_time: '2026-04-27T01:00:00.000Z',
      end_time: '2026-04-27T02:00:00.000Z',
    })) as { tempId: string; previousEntriesList: unknown };

    expect(markNew).toHaveBeenCalledTimes(1);
    expect(markNew.mock.calls[0]?.[0]).toMatch(/^temp-/);
    expect(ctx.tempId).toBe(markNew.mock.calls[0]?.[0]);

    const cached = queryClient.getQueryData<Array<{ id: string; title: string }>>(LIST_KEY)!;
    expect(cached).toHaveLength(2);
    expect(cached[1]).toMatchObject({ id: ctx.tempId, title: 'New' });
  });

  it('onSuccess: 2 件目以降は toast.success を表示し Inspector は開かない', () => {
    const { queryClient } = renderUseEntryMutations();
    seedList(queryClient, [
      { id: 'temp-x', title: 'temp', tagId: null },
      { id: 'other', title: 'other', tagId: null },
    ]);
    utilsMock.entries.list.getData.mockReturnValue([{ id: 'real', title: 'New' }, { id: 'other' }]);

    captured.create!.onSuccess!(
      { id: 'real', title: 'New' },
      { tagId: 'tag-1' },
      { tempId: 'temp-x' },
    );

    expect(clearNew).toHaveBeenCalledWith('temp-x');
    expect(openInspector).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('onSuccess: 初回エントリは Inspector を開き toast を出さない', () => {
    const { queryClient } = renderUseEntryMutations();
    seedList(queryClient, []);
    utilsMock.entries.list.getData.mockReturnValue([{ id: 'real' }]);

    captured.create!.onSuccess!(
      { id: 'real', title: 'New' },
      { tagId: null },
      { tempId: 'temp-x' },
    );

    expect(openInspector).toHaveBeenCalledWith('real');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('onSuccess: suppressCreateToast=true なら 2 件目以降でも toast を抑制', () => {
    const { queryClient } = renderUseEntryMutations({ suppressCreateToast: true });
    seedList(queryClient, []);
    utilsMock.entries.list.getData.mockReturnValue([{ id: 'a' }, { id: 'b' }]);

    captured.create!.onSuccess!({ id: 'b', title: 'New' }, { tagId: null }, { tempId: 'temp-x' });

    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('onError: snapshot からロールバックし clearNew を呼ぶ', () => {
    const { queryClient } = renderUseEntryMutations();
    const original = [{ id: 'a', title: 'A' }];
    seedList(queryClient, original);

    const ctx = {
      tempId: 'temp-x',
      previousEntriesList: [[LIST_KEY, original]] as Array<[unknown, unknown]>,
    };
    queryClient.setQueryData(LIST_KEY, [{ id: 'temp-x' }]);

    captured.create!.onError!({ message: 'fail' }, {}, ctx);

    expect(clearNew).toHaveBeenCalledWith('temp-x');
    expect(queryClient.getQueryData(LIST_KEY)).toEqual(original);
  });

  it('onError: TIME_OVERLAP エラーは専用 toast を出す', () => {
    renderUseEntryMutations();
    captured.create!.onError!(
      { message: 'TIME_OVERLAP: 既にエントリがあります' },
      {},
      { tempId: 'temp-x', previousEntriesList: [] },
    );
    expect(toastError).toHaveBeenCalledWith('entry.toast.timeOverlap');
  });

  it('onSettled: list.invalidate を呼ぶ', () => {
    renderUseEntryMutations();
    captured.create!.onSettled!(undefined, null, {}, undefined);
    expect(utilsMock.entries.list.invalidate).toHaveBeenCalled();
  });
});

// =============================================================================
// updateEntry
// =============================================================================

describe('useEntryMutations.updateEntry', () => {
  it('onMutate: 楽観的に list cache に updateData をマージする', async () => {
    const { queryClient } = renderUseEntryMutations();
    seedList(queryClient, [
      { id: 'e1', title: 'Old', tagId: null },
      { id: 'e2', title: 'Other', tagId: null },
    ]);
    utilsMock.entries.getById.getData.mockReturnValue({ id: 'e1', title: 'Old' });

    await captured.update!.onMutate!({
      id: 'e1',
      data: { title: 'Updated' },
    });

    const cached = queryClient.getQueryData<Array<{ id: string; title: string }>>(LIST_KEY)!;
    expect(cached.find((e) => e.id === 'e1')?.title).toBe('Updated');
    expect(cached.find((e) => e.id === 'e2')?.title).toBe('Other');
  });

  it('onError: CONFLICT は reload action 付き toast を出す', () => {
    renderUseEntryMutations();
    captured.update!.onError!(
      { data: { code: 'CONFLICT' }, message: 'conflict' },
      { id: 'e1', data: {} },
      { id: 'e1', previousEntriesList: [], previousEntry: null },
    );
    expect(toastError).toHaveBeenCalledTimes(1);
    const [, opts] = toastError.mock.calls[0] as [string, { action: { onClick: () => void } }];
    opts.action.onClick();
    expect(utilsMock.entries.list.invalidate).toHaveBeenCalled();
    expect(utilsMock.entries.getById.invalidate).toHaveBeenCalledWith({ id: 'e1' });
  });

  it('onError: TIME_OVERLAP も専用 toast を出す', () => {
    renderUseEntryMutations();
    captured.update!.onError!(
      { data: undefined, message: 'TIME_OVERLAP' },
      { id: 'e1', data: {} },
      { id: 'e1', previousEntriesList: [], previousEntry: null },
    );
    expect(toastError).toHaveBeenCalledWith('entry.toast.timeOverlap');
  });

  it('onError: 一般エラーは updateFailed toast を出し snapshot からロールバックする', () => {
    const { queryClient } = renderUseEntryMutations();
    const original = [{ id: 'e1', title: 'Old' }];
    seedList(queryClient, [{ id: 'e1', title: 'Half-Updated' }]);

    captured.update!.onError!(
      { data: undefined, message: 'unknown' },
      { id: 'e1', data: {} },
      {
        id: 'e1',
        previousEntriesList: [[LIST_KEY, original]],
        previousEntry: { id: 'e1', title: 'Old' },
      },
    );

    expect(toastError).toHaveBeenCalledWith('entry.toast.updateFailed');
    expect(queryClient.getQueryData(LIST_KEY)).toEqual(original);
    expect(utilsMock.entries.getById.setData).toHaveBeenCalledWith(
      { id: 'e1' },
      { id: 'e1', title: 'Old' },
    );
  });
});

// =============================================================================
// deleteEntry
// =============================================================================

describe('useEntryMutations.deleteEntry', () => {
  it('onMutate: 楽観的に list から削除し undo toast を出し Inspector を閉じる', async () => {
    const { queryClient } = renderUseEntryMutations();
    seedList(queryClient, [
      { id: 'e1', title: 'A' },
      { id: 'e2', title: 'B' },
    ]);
    utilsMock.entries.list.getData.mockReturnValue([
      { id: 'e1', title: 'A' },
      { id: 'e2', title: 'B' },
    ]);
    utilsMock.entries.getById.getData.mockReturnValue({ id: 'e1', title: 'A' });

    await captured.delete!.onMutate!({ id: 'e1' });

    const cached = queryClient.getQueryData<Array<{ id: string }>>(LIST_KEY)!;
    expect(cached.map((e) => e.id)).toEqual(['e2']);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(closeInspector).toHaveBeenCalled();
  });

  it('onMutate の undo toast クリックで restoreEntry.mutate({id}) が呼ばれる', async () => {
    const { queryClient } = renderUseEntryMutations();
    seedList(queryClient, [{ id: 'e1', title: 'A' }]);
    utilsMock.entries.list.getData.mockReturnValue([{ id: 'e1', title: 'A' }]);
    utilsMock.entries.getById.getData.mockReturnValue({ id: 'e1', title: 'A' });

    await captured.delete!.onMutate!({ id: 'e1' });

    const [, opts] = toastSuccess.mock.calls[0] as [string, { action: { onClick: () => void } }];
    opts.action.onClick();
    expect(mutateMocks.restore).toHaveBeenCalledWith({ id: 'e1' });
  });

  it('onError: snapshot からロールバックし deleteFailed toast を出す', () => {
    const { queryClient } = renderUseEntryMutations();
    const original = [{ id: 'e1', title: 'A' }];
    seedList(queryClient, []);

    captured.delete!.onError!(
      { message: 'fail' },
      { id: 'e1' },
      {
        id: 'e1',
        previousEntriesList: [[LIST_KEY, original]],
        previousEntry: { id: 'e1', title: 'A' },
      },
    );

    expect(toastError).toHaveBeenCalled();
    expect(queryClient.getQueryData(LIST_KEY)).toEqual(original);
  });

  it('onSuccess: list と getById を refetchType=all で invalidate する', () => {
    renderUseEntryMutations();
    captured.delete!.onSuccess!(undefined, { id: 'e1' }, undefined);
    expect(utilsMock.entries.list.invalidate).toHaveBeenCalledWith(undefined, {
      refetchType: 'all',
    });
    expect(utilsMock.entries.getById.invalidate).toHaveBeenCalledWith(
      { id: 'e1' },
      { refetchType: 'all' },
    );
  });
});

// =============================================================================
// restoreEntry
// =============================================================================

describe('useEntryMutations.restoreEntry', () => {
  it('onSuccess: restored toast + list/getById invalidate', () => {
    renderUseEntryMutations();
    captured.restore!.onSuccess!(undefined, { id: 'e1' }, undefined);
    expect(toastSuccess).toHaveBeenCalledWith('entry.toast.restored');
    expect(utilsMock.entries.list.invalidate).toHaveBeenCalledWith(undefined, {
      refetchType: 'all',
    });
    expect(utilsMock.entries.getById.invalidate).toHaveBeenCalledWith(
      { id: 'e1' },
      { refetchType: 'all' },
    );
  });

  it('onError: restoreFailed toast', () => {
    renderUseEntryMutations();
    captured.restore!.onError!({ message: 'fail' }, { id: 'e1' }, undefined);
    expect(toastError).toHaveBeenCalledWith('entry.toast.restoreFailed');
  });
});

// =============================================================================
// bulkUpdate / bulkDelete / bulkAddTags
// =============================================================================

describe('useEntryMutations.bulkUpdateEntries', () => {
  it('onMutate: 指定 ids のみ updateData をマージする', async () => {
    const { queryClient } = renderUseEntryMutations();
    seedList(queryClient, [
      { id: 'a', title: 'A', tagId: null },
      { id: 'b', title: 'B', tagId: null },
      { id: 'c', title: 'C', tagId: null },
    ]);

    await captured.bulkUpdate!.onMutate!({ ids: ['a', 'c'], data: { title: 'X' } });

    const cached = queryClient.getQueryData<Array<{ id: string; title: string }>>(LIST_KEY)!;
    expect(cached.find((e) => e.id === 'a')?.title).toBe('X');
    expect(cached.find((e) => e.id === 'b')?.title).toBe('B');
    expect(cached.find((e) => e.id === 'c')?.title).toBe('X');
  });

  it('onError: snapshot からロールバックし toast を出す', () => {
    const { queryClient } = renderUseEntryMutations();
    const original = [{ id: 'a', title: 'A' }];
    seedList(queryClient, [{ id: 'a', title: 'X' }]);

    captured.bulkUpdate!.onError!(
      { message: 'fail' },
      { ids: ['a'], data: {} },
      { previousEntriesList: [[LIST_KEY, original]] },
    );

    expect(queryClient.getQueryData(LIST_KEY)).toEqual(original);
    expect(toastError).toHaveBeenCalled();
  });
});

describe('useEntryMutations.bulkDeleteEntries', () => {
  it('onMutate: 指定 ids のみ list から除外する', async () => {
    const { queryClient } = renderUseEntryMutations();
    seedList(queryClient, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    await captured.bulkDelete!.onMutate!({ ids: ['a', 'c'] });

    const cached = queryClient.getQueryData<Array<{ id: string }>>(LIST_KEY)!;
    expect(cached.map((e) => e.id)).toEqual(['b']);
  });

  it('onSuccess: closeInspector を呼ぶ', () => {
    renderUseEntryMutations();
    captured.bulkDelete!.onSuccess!({ count: 2 }, { ids: ['a', 'b'] }, undefined);
    expect(closeInspector).toHaveBeenCalled();
  });
});

describe('useEntryMutations.bulkAddTags', () => {
  it('onMutate: entryIds に tagId を付与する', async () => {
    renderUseEntryMutations();
    utilsMock.entries.list.getData.mockReturnValue([
      { id: 'a', tagId: null },
      { id: 'b', tagId: null },
    ]);

    await captured.bulkAddTags!.onMutate!({ entryIds: ['a'], tagId: 'tag-1' });

    expect(utilsMock.entries.list.setData).toHaveBeenCalledWith(undefined, expect.any(Function));
    const updater = utilsMock.entries.list.setData.mock.calls[0]?.[1] as (
      data: Array<{ id: string; tagId: string | null }> | undefined,
    ) => Array<{ id: string; tagId: string | null }> | undefined;
    const result = updater([
      { id: 'a', tagId: null },
      { id: 'b', tagId: null },
    ]);
    expect(result).toEqual([
      { id: 'a', tagId: 'tag-1' },
      { id: 'b', tagId: null },
    ]);
  });

  it('onSuccess: list / getTagStats を invalidate', () => {
    renderUseEntryMutations();
    captured.bulkAddTags!.onSuccess!(undefined, { entryIds: ['a'], tagId: 't' }, undefined);
    expect(utilsMock.entries.list.invalidate).toHaveBeenCalled();
    expect(utilsMock.entries.getTagStats.invalidate).toHaveBeenCalled();
  });

  it('onError: previousEntries で list を復元', () => {
    renderUseEntryMutations();
    const previous = [{ id: 'a', tagId: null }];

    captured.bulkAddTags!.onError!(
      { message: 'fail' },
      { entryIds: ['a'], tagId: 't' },
      { previousEntries: previous },
    );

    expect(utilsMock.entries.list.setData).toHaveBeenCalledWith(undefined, previous);
    expect(toastError).toHaveBeenCalled();
  });
});
