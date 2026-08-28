import { describe, expect, it } from 'vitest';

import { shouldPersistQuery } from './should-persist-query';

describe('shouldPersistQuery', () => {
  it('成功した通常queryを永続化する', () => {
    expect(shouldPersistQuery({ state: { status: 'success', data: { id: 'data' } } })).toBe(true);
  });

  it('persist=falseのqueryを永続化しない', () => {
    expect(
      shouldPersistQuery({
        state: { status: 'success', data: ['search result'] },
        meta: { persist: false },
      }),
    ).toBe(false);
  });

  it('errorまたはdataなしのqueryを永続化しない', () => {
    expect(shouldPersistQuery({ state: { status: 'error', data: undefined } })).toBe(false);
    expect(shouldPersistQuery({ state: { status: 'success', data: undefined } })).toBe(false);
  });
});
