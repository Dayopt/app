import { describe, expect, it } from 'vitest';

import { cn } from '../class-names';

describe('cn', () => {
  it('conditional class を連結する', () => {
    expect(cn('base', false && 'hidden', { active: true })).toBe('base active');
  });

  it('競合する Tailwind class は後勝ちで統合する', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
