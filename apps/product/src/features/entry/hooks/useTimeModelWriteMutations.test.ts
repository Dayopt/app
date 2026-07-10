import { describe, expect, it } from 'vitest';

import { useTimeModelWriteMutations } from './useTimeModelWriteMutations';

describe('useTimeModelWriteMutations', () => {
  it('Plan と Log の作成・編集 mutation をまとめる hook を提供する', () => {
    expect(useTimeModelWriteMutations).toBeTypeOf('function');
  });
});
