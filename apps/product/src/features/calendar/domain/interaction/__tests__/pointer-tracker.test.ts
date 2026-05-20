import { describe, expect, it } from 'vitest';

import { clientYToGridY, constrainToRect, getPointerPoint, isTouchEvent } from '../pointer-tracker';

describe('getPointerPoint', () => {
  it('extracts coordinates from a mouse event', () => {
    const event = { clientX: 100, clientY: 200 };
    expect(getPointerPoint(event)).toEqual({ clientX: 100, clientY: 200 });
  });

  it('extracts coordinates from a touch event', () => {
    const event = {
      touches: [{ clientX: 150, clientY: 250 }],
    };
    expect(getPointerPoint(event)).toEqual({ clientX: 150, clientY: 250 });
  });

  it('falls back to changedTouches for touchend', () => {
    const event = {
      touches: [] as Array<{ clientX: number; clientY: number }>,
      changedTouches: [{ clientX: 300, clientY: 400 }],
    };
    expect(getPointerPoint(event)).toEqual({ clientX: 300, clientY: 400 });
  });

  it('returns zero point when touch has no touches', () => {
    const event = {
      touches: [] as Array<{ clientX: number; clientY: number }>,
    };
    expect(getPointerPoint(event)).toEqual({ clientX: 0, clientY: 0 });
  });
});

describe('constrainToRect', () => {
  const bounds = { left: 50, right: 350, top: 100, bottom: 600 };

  it('returns point unchanged when within bounds', () => {
    expect(constrainToRect({ clientX: 200, clientY: 300 }, bounds)).toEqual({
      clientX: 200,
      clientY: 300,
    });
  });

  it('clamps to left edge', () => {
    expect(constrainToRect({ clientX: 10, clientY: 300 }, bounds)).toEqual({
      clientX: 50,
      clientY: 300,
    });
  });

  it('clamps to right edge', () => {
    expect(constrainToRect({ clientX: 500, clientY: 300 }, bounds)).toEqual({
      clientX: 350,
      clientY: 300,
    });
  });

  it('clamps to top edge', () => {
    expect(constrainToRect({ clientX: 200, clientY: 50 }, bounds)).toEqual({
      clientX: 200,
      clientY: 100,
    });
  });

  it('clamps to bottom edge', () => {
    expect(constrainToRect({ clientX: 200, clientY: 700 }, bounds)).toEqual({
      clientX: 200,
      clientY: 600,
    });
  });
});

describe('clientYToGridY', () => {
  it('converts viewport Y to grid-relative Y', () => {
    // Grid container top at 80px, scrolled 100px
    expect(clientYToGridY(200, 80, 100)).toBe(220); // 200 - 80 + 100
  });

  it('handles zero scroll', () => {
    expect(clientYToGridY(200, 80, 0)).toBe(120); // 200 - 80
  });
});

describe('isTouchEvent', () => {
  it('returns true for touch-like events', () => {
    expect(isTouchEvent({ touches: [] })).toBe(true);
  });

  it('returns false for mouse-like events', () => {
    expect(isTouchEvent({ clientX: 0, clientY: 0 })).toBe(false);
  });
});
