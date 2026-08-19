/**
 * TagService テスト共有ヘルパー
 *
 * tag-service-query.test.ts から使う Supabase mock のセットアップ関数群。
 * CRUD / マージ / アーカイブ向けヘルパーは対応する service ごと撤去済み
 * （#2162 tag-model-replacement Step 7）。
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
