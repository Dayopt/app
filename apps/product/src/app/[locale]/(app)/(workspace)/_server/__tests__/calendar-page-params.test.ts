import { describe, expect, it } from 'vitest';

import { parseMultiDayViewParam } from '../calendar-page-params';

describe('parseMultiDayViewParam', () => {
  it.each(['2day', '3day', '7day'])('%sをmulti-day viewとして受理する', (value) => {
    expect(parseMultiDayViewParam(value)).toBe(value);
  });

  it.each(['1day', '8day', '9day', '10day', 'week', '3days'])('%sを拒否する', (value) => {
    expect(parseMultiDayViewParam(value)).toBeNull();
  });
});
