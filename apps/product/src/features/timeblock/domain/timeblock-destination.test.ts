import { describe, expect, it } from 'vitest';

import { isPlanRecordDrop, resolveTimeblockDestination } from './timeblock-destination';

const now = new Date('2026-07-10T12:00:00.000Z');

describe('resolveTimeblockDestination', () => {
  it('終了が現在より未来なら Plan を返す', () => {
    expect(resolveTimeblockDestination('2026-07-10T12:00:00.001Z', now)).toBe('plan');
  });

  it('終了が現在以前なら Record を返す', () => {
    expect(resolveTimeblockDestination('2026-07-10T12:00:00.000Z', now)).toBe('record');
  });
});

describe('isPlanRecordDrop', () => {
  it('Plan から Record レーンへのドロップだけを記録化とみなす', () => {
    expect(isPlanRecordDrop('plan', 'record')).toBe(true);
    expect(isPlanRecordDrop('record', 'plan')).toBe(false);
    expect(isPlanRecordDrop('plan', 'plan')).toBe(false);
  });
});
