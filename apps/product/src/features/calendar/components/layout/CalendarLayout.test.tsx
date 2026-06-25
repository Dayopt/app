import { describe, expect, it } from 'vitest';

import { canRecoverSideRailSpace, shouldUseSideRailSheet } from './CalendarLayout';

describe('shouldUseSideRailSheet', () => {
  it('keeps the desktop rail while the page is wide enough', () => {
    expect(
      shouldUseSideRailSheet({
        layoutWidth: 1024,
        maxPageWidth: 1024,
      }),
    ).toBe(false);
  });

  it('switches to sheet when the page is narrow', () => {
    expect(
      shouldUseSideRailSheet({
        layoutWidth: 1023,
        maxPageWidth: 1024,
      }),
    ).toBe(true);
  });

  it('does not depend on the resized rail width', () => {
    const params = {
      layoutWidth: 1100,
      maxPageWidth: 1024,
    };

    expect(shouldUseSideRailSheet(params)).toBe(false);
  });

  it('keeps the rail before page measurement is available', () => {
    expect(
      shouldUseSideRailSheet({
        layoutWidth: null,
        maxPageWidth: 1024,
      }),
    ).toBe(false);
  });
});

describe('canRecoverSideRailSpace', () => {
  it('returns true when closing sidebar can recover enough page width', () => {
    expect(
      canRecoverSideRailSpace({
        layoutWidth: 900,
        recoverableWidth: 256,
        maxPageWidth: 1024,
      }),
    ).toBe(true);
  });

  it('returns false when closing sidebar is still not enough', () => {
    expect(
      canRecoverSideRailSpace({
        layoutWidth: 720,
        recoverableWidth: 256,
        maxPageWidth: 1024,
      }),
    ).toBe(false);
  });
});
