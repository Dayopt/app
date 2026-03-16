import type { ChronotypeSettings, ProductivityZone } from '@/types/chronotype';
import { describe, expect, it } from 'vitest';
import {
  getChronotypeProfile,
  getEnabledChronotypeProfile,
  getPeakHours,
  getProductivityZoneForHour,
  getVisibleProductivityZones,
} from '../utils';

describe('getChronotypeProfile', () => {
  it('returns lion preset for lion type', () => {
    const profile = getChronotypeProfile('lion');
    expect(profile.type).toBe('lion');
    expect(profile.productivityZones.length).toBeGreaterThan(0);
  });

  it('returns bear preset for bear type', () => {
    const profile = getChronotypeProfile('bear');
    expect(profile.type).toBe('bear');
    expect(profile.productivityZones.length).toBeGreaterThan(0);
  });

  it('returns wolf preset for wolf type', () => {
    const profile = getChronotypeProfile('wolf');
    expect(profile.type).toBe('wolf');
    expect(profile.productivityZones.length).toBeGreaterThan(0);
  });

  it('returns dolphin preset for dolphin type', () => {
    const profile = getChronotypeProfile('dolphin');
    expect(profile.type).toBe('dolphin');
    expect(profile.productivityZones.length).toBeGreaterThan(0);
  });

  it('returns custom type with provided custom zones', () => {
    const customZones: ProductivityZone[] = [
      { startHour: 8, endHour: 12, level: 'peak', label: 'Custom Peak' },
      { startHour: 14, endHour: 18, level: 'recovery', label: 'Custom Recovery' },
    ];

    const profile = getChronotypeProfile('custom', customZones);
    expect(profile.type).toBe('custom');
    expect(profile.productivityZones).toEqual(customZones);
  });

  it('returns empty zones for custom type without custom zones', () => {
    const profile = getChronotypeProfile('custom');
    expect(profile.type).toBe('custom');
    expect(profile.productivityZones).toEqual([]);
  });

  it('returns the same preset for a type called multiple times', () => {
    const profile1 = getChronotypeProfile('lion');
    const profile2 = getChronotypeProfile('lion');

    expect(profile1.type).toBe(profile2.type);
    expect(profile1.productivityZones).toEqual(profile2.productivityZones);
  });
});

describe('getEnabledChronotypeProfile', () => {
  it('returns profile when enabled is true', () => {
    const settings: Pick<ChronotypeSettings, 'enabled' | 'type' | 'customZones'> = {
      enabled: true,
      type: 'lion',
    };

    const profile = getEnabledChronotypeProfile(settings);
    expect(profile).not.toBeNull();
    expect(profile?.type).toBe('lion');
  });

  it('returns null when enabled is false', () => {
    const settings: Pick<ChronotypeSettings, 'enabled' | 'type' | 'customZones'> = {
      enabled: false,
      type: 'bear',
    };

    const profile = getEnabledChronotypeProfile(settings);
    expect(profile).toBeNull();
  });

  it('returns custom profile with custom zones when enabled', () => {
    const customZones: ProductivityZone[] = [
      { startHour: 9, endHour: 13, level: 'peak', label: 'My Peak' },
    ];

    const settings: Pick<ChronotypeSettings, 'enabled' | 'type' | 'customZones'> = {
      enabled: true,
      type: 'custom',
      customZones,
    };

    const profile = getEnabledChronotypeProfile(settings);
    expect(profile).not.toBeNull();
    expect(profile?.type).toBe('custom');
    expect(profile?.productivityZones).toEqual(customZones);
  });

  it('returns null regardless of type when disabled', () => {
    const settings: Pick<ChronotypeSettings, 'enabled' | 'type' | 'customZones'> = {
      enabled: false,
      type: 'custom',
    };

    const profile = getEnabledChronotypeProfile(settings);
    expect(profile).toBeNull();
  });
});

describe('getProductivityZoneForHour', () => {
  it('returns zone when hour is within a normal zone', () => {
    const profile = getChronotypeProfile('bear');
    // Bear peak zone: 10-14
    const zone = getProductivityZoneForHour(profile, 12);

    expect(zone).not.toBeNull();
    expect(zone?.level).toBe('peak');
  });

  it('returns null when hour is outside all zones', () => {
    const profile = getChronotypeProfile('bear');
    // Bear zones end at 23, check midnight area
    const zone = getProductivityZoneForHour(profile, 0);

    expect(zone).toBeNull();
  });

  it('returns zone at zone start hour (inclusive)', () => {
    const profile = getChronotypeProfile('lion');
    // Lion peak zone: 7-12
    const zone = getProductivityZoneForHour(profile, 7);

    expect(zone).not.toBeNull();
    expect(zone?.level).toBe('peak');
  });

  it('returns null at zone end hour (exclusive)', () => {
    const profile = getChronotypeProfile('lion');
    // Lion peak zone: 7-12, so hour 12 should be outside
    const zone = getProductivityZoneForHour(profile, 12);

    expect(zone?.level).not.toBe('peak');
  });

  it('returns correct zone for midnight-crossing zone (startHour > endHour)', () => {
    const profile = getChronotypeProfile('wolf');
    // Wolf winddown zone: 23-1 (crosses midnight)
    // Check hour 23 (should match)
    const zone23 = getProductivityZoneForHour(profile, 23);
    expect(zone23).not.toBeNull();
    expect(zone23?.level).toBe('winddown');

    // Check hour 0 (should match)
    const zone0 = getProductivityZoneForHour(profile, 0);
    expect(zone0).not.toBeNull();
    expect(zone0?.level).toBe('winddown');

    // Check hour 2 (should not match)
    const zone2 = getProductivityZoneForHour(profile, 2);
    expect(zone2?.level).not.toBe('winddown');
  });

  it('returns the correct zone for multiple overlapping possibilities', () => {
    // Use dolphin which has several zones throughout the day
    const profile = getChronotypeProfile('dolphin');
    const zone = getProductivityZoneForHour(profile, 10);

    expect(zone).not.toBeNull();
    // Just verify it returns a zone, the exact one depends on dolphin's zones
  });

  it('handles boundary hours correctly in midnight-crossing zones', () => {
    const profile = getChronotypeProfile('wolf');
    // Wolf winddown: 23-1
    const zone23 = getProductivityZoneForHour(profile, 23);
    const zone0 = getProductivityZoneForHour(profile, 0);
    const zone1 = getProductivityZoneForHour(profile, 1);

    expect(zone23?.level).toBe('winddown');
    expect(zone0?.level).toBe('winddown');
    expect(zone1).not.toEqual(expect.objectContaining({ level: 'winddown' }));
  });
});

describe('getVisibleProductivityZones', () => {
  it('includes zone fully within view range', () => {
    const profile = getChronotypeProfile('bear');
    // Bear peak zone: 10-14
    // Viewing 8-20
    const zones = getVisibleProductivityZones(profile, 8, 20, 50);

    const peakZone = zones.find((z) => z.zone.level === 'peak');
    expect(peakZone).toBeDefined();
    expect(peakZone?.top).toBe((10 - 8) * 50); // 100
    expect(peakZone?.height).toBe((14 - 10) * 50); // 200
  });

  it('excludes zone completely outside view range', () => {
    const profile = getChronotypeProfile('bear');
    // Bear zones: 7-23, viewing 0-6
    const zones = getVisibleProductivityZones(profile, 0, 6, 50);

    expect(zones.length).toBe(0);
  });

  it('clips zone partially within view range (start clipped)', () => {
    const profile = getChronotypeProfile('bear');
    // Bear peak zone: 10-14
    // Viewing 11-20 (zone starts before view)
    const zones = getVisibleProductivityZones(profile, 11, 20, 50);

    const peakZone = zones.find((z) => z.zone.level === 'peak');
    expect(peakZone).toBeDefined();
    expect(peakZone?.top).toBe((11 - 11) * 50); // 0
    expect(peakZone?.height).toBe((14 - 11) * 50); // 150
  });

  it('clips zone partially within view range (end clipped)', () => {
    const profile = getChronotypeProfile('bear');
    // Bear peak zone: 10-14
    // Viewing 8-12 (zone ends after view)
    const zones = getVisibleProductivityZones(profile, 8, 12, 50);

    const peakZone = zones.find((z) => z.zone.level === 'peak');
    expect(peakZone).toBeDefined();
    expect(peakZone?.top).toBe((10 - 8) * 50); // 100
    expect(peakZone?.height).toBe((12 - 10) * 50); // 100
  });

  it('handles midnight-crossing zones correctly (above view)', () => {
    const profile = getChronotypeProfile('wolf');
    // Wolf winddown zone: 23-1
    // Viewing 20-24
    const zones = getVisibleProductivityZones(profile, 20, 24, 50);

    const winddownZone = zones.find((z) => z.zone.level === 'winddown');
    expect(winddownZone).toBeDefined();
    expect(winddownZone?.top).toBe((23 - 20) * 50); // 150
    expect(winddownZone?.height).toBe((24 - 23) * 50); // 50
  });

  it('handles midnight-crossing zones correctly (below view)', () => {
    const profile = getChronotypeProfile('wolf');
    // Wolf winddown zone: 23-1
    // Viewing 0-4
    const zones = getVisibleProductivityZones(profile, 0, 4, 50);

    const winddownZone = zones.find((z) => z.zone.level === 'winddown');
    expect(winddownZone).toBeDefined();
    expect(winddownZone?.top).toBe((0 - 0) * 50); // 0
    expect(winddownZone?.height).toBe((1 - 0) * 50); // 50
  });

  it('handles midnight-crossing zones partially in view (above midnight only)', () => {
    const profile = getChronotypeProfile('wolf');
    // Wolf winddown zone: 23-1 (crosses midnight)
    // Viewing 22-24 (only sees the above-midnight part)
    const zones = getVisibleProductivityZones(profile, 22, 24, 50);

    const winddownZones = zones.filter((z) => z.zone.level === 'winddown');
    expect(winddownZones.length).toBe(1);
    // Should show 23-24
    expect(winddownZones[0]!.top).toBe((23 - 22) * 50); // 50
    expect(winddownZones[0]!.height).toBe((24 - 23) * 50); // 50
  });

  it('handles midnight-crossing zones partially in view (below midnight only)', () => {
    const profile = getChronotypeProfile('wolf');
    // Wolf winddown zone: 23-1 (crosses midnight)
    // Viewing 0-2 (only sees the below-midnight part)
    const zones = getVisibleProductivityZones(profile, 0, 2, 50);

    const winddownZones = zones.filter((z) => z.zone.level === 'winddown');
    expect(winddownZones.length).toBe(1);
    // Should show 0-1
    expect(winddownZones[0]!.top).toBe((0 - 0) * 50); // 0
    expect(winddownZones[0]!.height).toBe((1 - 0) * 50); // 50
  });

  it('respects hourHeight parameter', () => {
    const profile = getChronotypeProfile('bear');
    // Bear peak zone: 10-14
    const zones1 = getVisibleProductivityZones(profile, 8, 20, 50);
    const zones2 = getVisibleProductivityZones(profile, 8, 20, 100);

    const peak1 = zones1.find((z) => z.zone.level === 'peak');
    const peak2 = zones2.find((z) => z.zone.level === 'peak');

    expect(peak1?.height).toBe(200); // 4 hours * 50
    expect(peak2?.height).toBe(400); // 4 hours * 100
  });

  it('returns all zones when view encompasses entire day', () => {
    const profile = getChronotypeProfile('bear');
    const zones = getVisibleProductivityZones(profile, 0, 24, 50);

    expect(zones.length).toBeGreaterThan(0);
    // Should have at least as many zones as the profile has
    expect(zones.length).toBeGreaterThanOrEqual(profile.productivityZones.length - 1); // -1 for midnight-crossing
  });
});

describe('getPeakHours', () => {
  it('returns formatted string for zones with peak level', () => {
    const zones: ProductivityZone[] = [
      { startHour: 10, endHour: 14, level: 'peak', label: 'Peak Hours' },
      { startHour: 7, endHour: 10, level: 'warmup', label: 'Warmup' },
    ];

    const result = getPeakHours(zones);
    expect(result).toBe('10:00 - 14:00');
  });

  it('returns dash when no peak zone exists', () => {
    const zones: ProductivityZone[] = [
      { startHour: 7, endHour: 10, level: 'warmup', label: 'Warmup' },
      { startHour: 14, endHour: 17, level: 'recovery', label: 'Recovery' },
    ];

    const result = getPeakHours(zones);
    expect(result).toBe('-');
  });

  it('returns peak hours for preset lion profile', () => {
    const profile = getChronotypeProfile('lion');
    const result = getPeakHours(profile.productivityZones);

    // Lion peak zone: 7-12
    expect(result).toBe('7:00 - 12:00');
  });

  it('returns peak hours for preset bear profile', () => {
    const profile = getChronotypeProfile('bear');
    const result = getPeakHours(profile.productivityZones);

    // Bear peak zone: 10-14
    expect(result).toBe('10:00 - 14:00');
  });

  it('returns peak hours for preset wolf profile', () => {
    const profile = getChronotypeProfile('wolf');
    const result = getPeakHours(profile.productivityZones);

    // Wolf peak zone: 15-21
    expect(result).toBe('15:00 - 21:00');
  });

  it('returns peak hours for preset dolphin profile', () => {
    const profile = getChronotypeProfile('dolphin');
    const result = getPeakHours(profile.productivityZones);

    // Dolphin peak zone: 8-12
    expect(result).toBe('8:00 - 12:00');
  });

  it('returns dash for custom profile with no zones', () => {
    const zones: ProductivityZone[] = [];
    const result = getPeakHours(zones);

    expect(result).toBe('-');
  });

  it('returns dash for custom profile with no peak zone', () => {
    const zones: ProductivityZone[] = [
      { startHour: 8, endHour: 12, level: 'warmup', label: 'Warmup' },
      { startHour: 14, endHour: 18, level: 'recovery', label: 'Recovery' },
    ];
    const result = getPeakHours(zones);

    expect(result).toBe('-');
  });

  it('handles multiple zones and returns only peak hours', () => {
    const zones: ProductivityZone[] = [
      { startHour: 6, endHour: 8, level: 'warmup', label: 'Warmup' },
      { startHour: 8, endHour: 12, level: 'peak', label: 'Peak' },
      { startHour: 12, endHour: 14, level: 'dip', label: 'Dip' },
      { startHour: 14, endHour: 17, level: 'recovery', label: 'Recovery' },
      { startHour: 17, endHour: 22, level: 'winddown', label: 'Winddown' },
    ];

    const result = getPeakHours(zones);
    expect(result).toBe('8:00 - 12:00');
  });

  it('formats hours correctly with zero-padding', () => {
    const zones: ProductivityZone[] = [{ startHour: 8, endHour: 9, level: 'peak', label: 'Peak' }];

    const result = getPeakHours(zones);
    expect(result).toBe('8:00 - 9:00');
  });
});

describe('Integration tests', () => {
  it('getChronotypeProfile and getPeakHours work together for all presets', () => {
    const types: Array<'lion' | 'bear' | 'wolf' | 'dolphin'> = ['lion', 'bear', 'wolf', 'dolphin'];

    types.forEach((type) => {
      const profile = getChronotypeProfile(type);
      const peakHours = getPeakHours(profile.productivityZones);

      // All presets should have a peak zone
      expect(peakHours).not.toBe('-');
    });
  });

  it('getProductivityZoneForHour returns zones from getChronotypeProfile', () => {
    const profile = getChronotypeProfile('bear');
    // Bear should have zones at 10 (peak zone start)
    const zone = getProductivityZoneForHour(profile, 10);

    expect(zone).not.toBeNull();
    expect(profile.productivityZones).toContainEqual(
      expect.objectContaining({ level: zone?.level }),
    );
  });

  it('getVisibleProductivityZones returns data consistent with getProductivityZoneForHour', () => {
    const profile = getChronotypeProfile('bear');
    const zones = getVisibleProductivityZones(profile, 8, 20, 50);

    // For each visible zone, verify it's in the profile
    zones.forEach((item) => {
      expect(profile.productivityZones).toContainEqual(item.zone);
    });
  });

  it('getEnabledChronotypeProfile with enabled:true returns same as getChronotypeProfile', () => {
    const settings: Pick<ChronotypeSettings, 'enabled' | 'type' | 'customZones'> = {
      enabled: true,
      type: 'lion',
    };

    const enabledProfile = getEnabledChronotypeProfile(settings);
    const directProfile = getChronotypeProfile('lion');

    expect(enabledProfile?.type).toBe(directProfile.type);
    expect(enabledProfile?.productivityZones).toEqual(directProfile.productivityZones);
  });
});
