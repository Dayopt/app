import { describe, expect, it } from 'vitest';

import { buildReportPath } from '../panel-url';

describe('buildReportPath', () => {
  it('builds the canonical /report URL', () => {
    expect(buildReportPath('ja', new Date(2026, 2, 25))).toBe('/ja/report?date=2026-03-25');
  });

  it('supports the default locale', () => {
    expect(buildReportPath('en', new Date(2026, 2, 25))).toBe('/en/report?date=2026-03-25');
  });
});
