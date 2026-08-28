import { describe, expect, it } from 'vitest';

import { resolveHealthStatus } from './health-status';

describe('resolveHealthStatus', () => {
  it('全dependencyがokならhealthyを返す', () => {
    expect(resolveHealthStatus(['ok', 'ok'])).toBe('healthy');
  });

  it('warningがあればdegradedを返す', () => {
    expect(resolveHealthStatus(['ok', 'warning'])).toBe('degraded');
  });

  it('errorをwarningより優先してunhealthyを返す', () => {
    expect(resolveHealthStatus(['warning', 'error'])).toBe('unhealthy');
  });

  it('skippedをreadiness判定から除外する', () => {
    expect(resolveHealthStatus(['ok', 'skipped'])).toBe('healthy');
  });
});
