import { describe, expect, it } from 'vitest';

import { containsPrivateTimeblockSearch, getTrpcErrorLogInput } from '../logger-policy';

describe('containsPrivateTimeblockSearch', () => {
  it.each(['plans.list', 'records.list'])('%sの検索語をprivateと判定する', (path) => {
    expect(containsPrivateTimeblockSearch({ path, input: { search: 'private words' } })).toBe(true);
  });

  it('通常の一覧や他procedureは対象外にする', () => {
    expect(containsPrivateTimeblockSearch({ path: 'plans.list', input: { limit: 20 } })).toBe(
      false,
    );
    expect(
      containsPrivateTimeblockSearch({ path: 'tags.list', input: { search: 'visible' } }),
    ).toBe(false);
  });
});

describe('getTrpcErrorLogInput', () => {
  it.each(['plans.list', 'records.list'])('%sの検索語はdevelopmentでも伏せる', (path) => {
    expect(
      getTrpcErrorLogInput({ path, input: { search: 'private words', limit: 21 } }, 'development'),
    ).toBe('[REDACTED]');
  });

  it('developmentの通常operationだけは既存どおりinputを残す', () => {
    const input = { limit: 20 };
    expect(getTrpcErrorLogInput({ path: 'plans.list', input }, 'development')).toBe(input);
  });

  it('productionでは検索以外も伏せる', () => {
    expect(getTrpcErrorLogInput({ path: 'tags.list', input: {} }, 'production')).toBe('[REDACTED]');
  });
});
