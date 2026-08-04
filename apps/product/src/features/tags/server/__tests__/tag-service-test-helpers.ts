/**
 * TagService テスト共有ヘルパー
 *
 * tag-service-*.test.ts 各ファイルから使う Supabase mock のセットアップ関数群
 */

import { vi } from 'vitest';

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

export function setupMockQuery(mockFrom: ReturnType<typeof vi.fn>, data: unknown[]) {
  const mock = createChainableMock(data);
  mockFrom.mockReturnValue(mock);
  return mock;
}

export function setupMockQueryError(mockFrom: ReturnType<typeof vi.fn>, errorMessage: string) {
  const mock = createChainableMock(null, { message: errorMessage });
  mockFrom.mockReturnValue(mock);
  return mock;
}

export function setupMockSingleQuery(mockFrom: ReturnType<typeof vi.fn>, data: unknown) {
  const mock = createChainableMock(data, data ? null : { message: 'Not found', code: 'PGRST116' });
  mockFrom.mockReturnValue(mock);
  return mock;
}

export function setupMockInsertQuery(
  mockFrom: ReturnType<typeof vi.fn>,
  data: unknown,
  siblings: unknown[] = [],
) {
  const siblingQuery = mockArrayResponse(siblings);
  const insertQuery = createChainableMock(data);
  mockFrom.mockReturnValueOnce(siblingQuery).mockReturnValueOnce(insertQuery);
  return insertQuery;
}

export function setupMockUpdateQuery(
  mockFrom: ReturnType<typeof vi.fn>,
  existingData: unknown,
  updatedData: unknown,
) {
  const mock = createChainableMock(existingData);

  // getById は maybeSingle()、更新結果は single() で返る。
  mock.maybeSingle = vi.fn().mockResolvedValue({ data: existingData, error: null });
  mock.single = vi.fn().mockResolvedValue({ data: updatedData, error: null });

  mockFrom.mockReturnValue(mock);
  return mock;
}

export function setupMockDeleteQuery(mockFrom: ReturnType<typeof vi.fn>, existingData: unknown) {
  let callCount = 0;

  mockFrom.mockImplementation((table: string) => {
    callCount++;

    if (table === 'plan_tags') {
      return createChainableMock(null);
    }

    const mock = createChainableMock(existingData);
    mock.single = vi.fn().mockResolvedValue({
      data: callCount === 1 ? existingData : null,
      error: null,
    });
    mock.then = vi.fn().mockImplementation((resolve) => resolve({ data: null, error: null }));

    return mock;
  });
}

/** `await ...single()` 経由で 1 件返すモック */
export function mockSingleResponse(data: unknown) {
  const mock = createChainableMock(data);
  mock.single = vi.fn().mockResolvedValue({ data, error: null });
  return mock;
}

/** await chain で配列を返すモック（select 結果の list） */
export function mockArrayResponse(data: unknown[]) {
  const mock = createChainableMock(data);
  mock.then = vi
    .fn()
    .mockImplementation((resolve: (v: unknown) => void) => resolve({ data, error: null }));
  return mock;
}

/** `await ...select(.., { count, head: true })` で count を返すモック */
function mockCountResponse(count: number) {
  const mock = createChainableMock(null);
  mock.then = vi
    .fn()
    .mockImplementation((resolve: (v: unknown) => void) => resolve({ count, error: null }));
  return mock;
}

/** merge() 用: getById x2 + children-count 用の sequence をまとめてセット */
export function setupMockMergeQueries(
  mockFrom: ReturnType<typeof vi.fn>,
  options: {
    sourceTag: unknown;
    targetTag: unknown;
    sourceChildrenCount: number;
  },
) {
  // 1: getById(source)  → single
  // 2: getById(target)  → single
  // 3: select children count → count
  mockFrom
    .mockReturnValueOnce(mockSingleResponse(options.sourceTag))
    .mockReturnValueOnce(mockSingleResponse(options.targetTag))
    .mockReturnValueOnce(mockCountResponse(options.sourceChildrenCount));
}
