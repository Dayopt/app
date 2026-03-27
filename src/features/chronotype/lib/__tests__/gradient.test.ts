import { describe, expect, it } from 'vitest';

import { CHRONOTYPE_PRESETS } from '../constants';
import { generateChronotypeGradient, getActiveZoneLevel } from '../gradient';

import type { ProductivityZone } from '@/types/chronotype';

describe('generateChronotypeGradient', () => {
  it('ゾーンが空なら "none" を返す', () => {
    expect(generateChronotypeGradient([], 'light')).toBe('none');
  });

  it('peak/dip がないゾーン配列でも "none" を返す', () => {
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
    // light は L≈0.98 ベース、dark は L≈0.18 ベース
    expect(light).toContain('0.98');
    expect(dark).toContain('0.18');
  });

  it('peak ゾーンで H=70 (amber) を使う', () => {
    const zones = CHRONOTYPE_PRESETS.bear.productivityZones;
    const result = generateChronotypeGradient(zones, 'light');

    // peak 区間の stop に H=70 が含まれる
    expect(result).toContain(' 70)');
  });

  it('dip ゾーンで H=250 (blue) を使う', () => {
    const zones = CHRONOTYPE_PRESETS.bear.productivityZones;
    const result = generateChronotypeGradient(zones, 'light');

    // dip 区間の stop に H=250 が含まれる
    expect(result).toContain(' 250)');
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

  it('stop が最適化されて 288 点より少なくなる', () => {
    const zones = CHRONOTYPE_PRESETS.bear.productivityZones;
    const result = generateChronotypeGradient(zones, 'light');

    // 最適化前は ~289 stop。最適化後は neutral 平坦区間が間引かれる
    const stopCount = result.split('%').length - 1;
    expect(stopCount).toBeLessThan(289);
    expect(stopCount).toBeGreaterThan(10); // 少なくとも遷移区間分は残る
  });
});

describe('getActiveZoneLevel', () => {
  const bearZones = CHRONOTYPE_PRESETS.bear.productivityZones;

  it('peak 時間帯では "peak" を返す', () => {
    // bear: peak = 10-14
    expect(getActiveZoneLevel(bearZones, 10)).toBe('peak');
    expect(getActiveZoneLevel(bearZones, 12)).toBe('peak');
    expect(getActiveZoneLevel(bearZones, 13.5)).toBe('peak');
  });

  it('dip 時間帯では "dip" を返す', () => {
    // bear: dip = 14-16
    expect(getActiveZoneLevel(bearZones, 14)).toBe('dip');
    expect(getActiveZoneLevel(bearZones, 15)).toBe('dip');
  });

  it('warmup/recovery/winddown 時間帯では null を返す', () => {
    // bear: warmup = 7-10
    expect(getActiveZoneLevel(bearZones, 8)).toBeNull();
    // bear: recovery = 16-19
    expect(getActiveZoneLevel(bearZones, 17)).toBeNull();
  });

  it('ゾーン外の時間帯では null を返す', () => {
    // bear: 0-7 はゾーン外
    expect(getActiveZoneLevel(bearZones, 3)).toBeNull();
  });

  it('日をまたぐゾーンを正しく判定する', () => {
    // wolf: winddown = 23-1
    const wolfZones = CHRONOTYPE_PRESETS.wolf.productivityZones;
    // winddown は peak/dip ではないので null
    expect(getActiveZoneLevel(wolfZones, 23.5)).toBeNull();
    expect(getActiveZoneLevel(wolfZones, 0.5)).toBeNull();
  });
});
