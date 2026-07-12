import { describe, expect, it } from 'vitest';
import { getVersionType, isPrerelease, sortVersions } from '../releases';

describe('sortVersions', () => {
  it('セマンティックバージョンを降順でソート', () => {
    const input = ['v0.1.0', 'v1.0.0', 'v0.2.0', 'v0.1.1'];
    expect(sortVersions(input)).toEqual(['v1.0.0', 'v0.2.0', 'v0.1.1', 'v0.1.0']);
  });

  it('vプレフィックスなしでも動作', () => {
    const input = ['0.1.0', '1.0.0', '0.2.0'];
    expect(sortVersions(input)).toEqual(['1.0.0', '0.2.0', '0.1.0']);
  });

  it('同じバージョンは安定', () => {
    const input = ['v1.0.0', 'v1.0.0'];
    expect(sortVersions(input)).toEqual(['v1.0.0', 'v1.0.0']);
  });

  it('空配列は空配列を返す', () => {
    expect(sortVersions([])).toEqual([]);
  });

  it('メジャーバージョンの違いで正しくソート', () => {
    const input = ['v2.0.0', 'v10.0.0', 'v1.0.0'];
    expect(sortVersions(input)).toEqual(['v10.0.0', 'v2.0.0', 'v1.0.0']);
  });
});

describe('isPrerelease', () => {
  it('beta を検出', () => {
    expect(isPrerelease('v1.0.0-beta.1')).toBe(true);
  });

  it('alpha を検出', () => {
    expect(isPrerelease('v1.0.0-alpha')).toBe(true);
  });

  it('rc を検出', () => {
    expect(isPrerelease('v1.0.0-rc.1')).toBe(true);
  });

  it('pre を検出', () => {
    expect(isPrerelease('v1.0.0-pre')).toBe(true);
  });

  it('正式リリースは false', () => {
    expect(isPrerelease('v1.0.0')).toBe(false);
    expect(isPrerelease('1.2.3')).toBe(false);
  });
});

describe('getVersionType', () => {
  it('prerelease を判定', () => {
    expect(getVersionType('v1.0.0-beta.1')).toBe('prerelease');
  });

  it('major を判定（x.0.0）', () => {
    expect(getVersionType('v1.0.0')).toBe('major');
  });

  it('minor を判定（x.y.0）', () => {
    expect(getVersionType('v1.1.0')).toBe('minor');
  });

  it('patch を判定（x.y.z）', () => {
    expect(getVersionType('v1.0.1')).toBe('patch');
    expect(getVersionType('v1.2.3')).toBe('patch');
  });

  it('vプレフィックスなしでも動作', () => {
    expect(getVersionType('1.0.0')).toBe('major');
    expect(getVersionType('0.1.0')).toBe('minor');
    expect(getVersionType('0.0.1')).toBe('patch');
  });
});
