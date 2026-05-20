import { describe, expect, it } from 'vitest';

import { CHRONOTYPE_PRESETS } from '../constants';
import { generateChronotypeGradient, getActiveZoneLevel } from '../gradient';

import type { ProductivityZone } from '@/lib/types/chronotype';

describe('generateChronotypeGradient', () => {
  it('ゾーンが空なら "none" を返す', () => {
    expect(generateChronotypeGradient([], 'light')).toBe('none');
  });

  it('deep/ease がないゾーン配列でも "none" を返す', () => {
    const zones: ProductivityZone[] = [
      { startHour: 7, endHour: 10, level: 'warmup', label: 'ウォームアップ' },
      { startHour: 14, endHour: 17, level: 'recovery', label: 'リカバリー' },
    ];
    expect(generateChronotypeGradient(zones, 'light')).toBe('none');
  });

  it('linear-gradient(to bottom, ...) 形式の文字列を返す', () => {
    const zones = CHRONOTYPE_PRESETS.bear.productivityZones;
    const result = generateChronotypeGradient(zones, 'light');

    expect(result).toMatch(/^linear-gradient\(to bottom, /);
    expect(result).toContain('oklch(');
    expect(result).toContain('%');
  });

  it('light と dark で異なる gradient を生成する', () => {
    const zones = CHRONOTYPE_PRESETS.bear.productivityZones;
    const light = generateChronotypeGradient(zones, 'light');
    const dark = generateChronotypeGradient(zones, 'dark');

    expect(light).not.toBe(dark);
    // light は L≈0.955 ゾーン色、dark は L≈0.21 ゾーン色
    expect(light).toContain('0.9550');
    expect(dark).toContain('0.2100');
  });

  it('deep ゾーンで H=70 (amber) を使う', () => {
    const zones = CHRONOTYPE_PRESETS.bear.productivityZones;
    const result = generateChronotypeGradient(zones, 'light');

    // deep 区間の stop に H=70 が含まれる
    expect(result).toContain(' 70)');
  });

  it('ease ゾーンで H=150 (green) を使う', () => {
    const zones = CHRONOTYPE_PRESETS.bear.productivityZones;
    const result = generateChronotypeGradient(zones, 'light');

    // ease 区間の stop に H=150 が含まれる
    expect(result).toContain(' 150)');
  });

  it('全プリセットで正常に生成できる', () => {
    for (const type of ['lion', 'bear', 'wolf', 'dolphin'] as const) {
      const zones = CHRONOTYPE_PRESETS[type].productivityZones;

      const light = generateChronotypeGradient(zones, 'light');
      const dark = generateChronotypeGradient(zones, 'dark');

      expect(light).toMatch(/^linear-gradient\(to bottom, /);
      expect(dark).toMatch(/^linear-gradient\(to bottom, /);
    }
  });

  it('smoothstep フェードで十分な stop 数を生成する', () => {
    const zones = CHRONOTYPE_PRESETS.bear.productivityZones;
    const result = generateChronotypeGradient(zones, 'light');

    // smoothstep: 各ゾーンで fade-in(6) + flat(1) + fade-out(6) + 両端(2)
    const stopCount = result.split('%').length - 1;
    expect(stopCount).toBeGreaterThanOrEqual(10);
  });

  it('フェード区間でアルファ値の中間ストップが含まれる', () => {
    const zones = CHRONOTYPE_PRESETS.bear.productivityZones;
    const result = generateChronotypeGradient(zones, 'light');

    // smoothstep フェードにより 0 < alpha < 1 のストップが含まれる
    expect(result).toMatch(/oklch\(.+\/ 0\.\d+\)/);
  });
});

describe('getActiveZoneLevel', () => {
  const bearZones = CHRONOTYPE_PRESETS.bear.productivityZones;

  it('deep 時間帯では "deep" を返す', () => {
    // bear: deep = 10-14
    expect(getActiveZoneLevel(bearZones, 10)).toBe('deep');
    expect(getActiveZoneLevel(bearZones, 12)).toBe('deep');
    expect(getActiveZoneLevel(bearZones, 13.5)).toBe('deep');
  });

  it('ease 時間帯では "ease" を返す', () => {
    // bear: ease = 15-17
    expect(getActiveZoneLevel(bearZones, 15)).toBe('ease');
    expect(getActiveZoneLevel(bearZones, 16)).toBe('ease');
  });

  it('deep/ease 以外の時間帯では null を返す', () => {
    // bear: 14-15 は deep と ease の間（neutral）
    expect(getActiveZoneLevel(bearZones, 14.5)).toBeNull();
    // bear: 8 は deep 前
    expect(getActiveZoneLevel(bearZones, 8)).toBeNull();
  });

  it('ゾーン外の時間帯では null を返す', () => {
    // bear: 深夜はゾーン外
    expect(getActiveZoneLevel(bearZones, 3)).toBeNull();
  });
});
