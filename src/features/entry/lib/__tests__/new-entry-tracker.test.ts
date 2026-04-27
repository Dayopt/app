import { afterEach, describe, expect, it } from 'vitest';

import { clearNew, isNewEntry, markNew } from '../new-entry-tracker';

// モジュールレベルの Set を共有しているため、各テスト後にクリーンアップする
const TEST_IDS = ['entry-1', 'entry-2', 'entry-3'];

afterEach(() => {
  TEST_IDS.forEach(clearNew);
});

describe('new-entry-tracker', () => {
  it('markNew で追加した ID は isNewEntry=true', () => {
    markNew('entry-1');
    expect(isNewEntry('entry-1')).toBe(true);
  });

  it('未マーク ID は isNewEntry=false', () => {
    expect(isNewEntry('entry-2')).toBe(false);
  });

  it('clearNew でマークが解除される', () => {
    markNew('entry-1');
    expect(isNewEntry('entry-1')).toBe(true);

    clearNew('entry-1');
    expect(isNewEntry('entry-1')).toBe(false);
  });

  it('複数 ID を独立して扱える', () => {
    markNew('entry-1');
    markNew('entry-2');

    expect(isNewEntry('entry-1')).toBe(true);
    expect(isNewEntry('entry-2')).toBe(true);
    expect(isNewEntry('entry-3')).toBe(false);

    clearNew('entry-1');
    expect(isNewEntry('entry-1')).toBe(false);
    expect(isNewEntry('entry-2')).toBe(true);
  });

  it('未登録 ID への clearNew は no-op（throw しない）', () => {
    expect(() => clearNew('entry-3')).not.toThrow();
    expect(isNewEntry('entry-3')).toBe(false);
  });

  it('markNew は冪等（同 ID を 2 回追加しても 1 回 clearNew で消える）', () => {
    markNew('entry-1');
    markNew('entry-1');

    clearNew('entry-1');
    expect(isNewEntry('entry-1')).toBe(false);
  });
});
