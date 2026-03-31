import { describe, expect, it } from 'vitest';

import type {
  DiscoveryInput,
  EnergyMapRow,
  EstimationAccuracyRow,
  StatsOverviewData,
  TimeByTagRow,
} from '../types/discovery.types';

import {
  checkConsistency,
  checkPlanningAccuracy,
  checkTagAffinity,
  checkTimePatterns,
  checkTrendComparisons,
  evaluateDiscoveries,
} from './discoveries';

// =============================================================================
// Helpers
// =============================================================================

const DEFAULT_CONFIG = {
  minTimePatternEntries: 3,
  minFulfillmentHighlight: 2.5,
  minTagEntries: 3,
  maxResults: 3,
  minBlankDelta: 10,
  minConsistencyRate: 0.8,
};

function makeOverview(overrides?: Partial<StatsOverviewData>): StatsOverviewData {
  return {
    cumulativeTime: { totalMinutes: 600 },
    avgFulfillment: { avgFulfillment: 2.5, entryCount: 10 },
    entryRate: { totalEntries: 10, plannedEntries: 10, entryRate: 0.9 },
    contextSwitches: { totalSwitches: 4, avgPerDay: 2 },
    blankRate: {
      availableMinutes: 480,
      scheduledMinutes: 300,
      blankMinutes: 180,
      blankRate: 0.375,
    },
    ...overrides,
  };
}

// =============================================================================
// checkTimePatterns
// =============================================================================

describe('checkTimePatterns', () => {
  it('returns empty when no rows meet threshold', () => {
    const energyMap: EnergyMapRow[] = [
      { hour: 9, dow: 1, avgFulfillment: 2.0, totalMinutes: 60, entryCount: 5 },
    ];
    const result = checkTimePatterns(energyMap, DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });

  it('returns empty when entry count is too low', () => {
    const energyMap: EnergyMapRow[] = [
      { hour: 14, dow: 3, avgFulfillment: 3.0, totalMinutes: 60, entryCount: 2 },
    ];
    const result = checkTimePatterns(energyMap, DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });

  it('detects high fulfillment time pattern', () => {
    const energyMap: EnergyMapRow[] = [
      { hour: 14, dow: 3, avgFulfillment: 2.8, totalMinutes: 120, entryCount: 5 },
    ];
    const result = checkTimePatterns(energyMap, DEFAULT_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'time_pattern',
      messageKey: 'timePatternHighFulfillment',
      messageParams: { day: 'wed', hour: 14 },
    });
  });

  it('returns only the highest confidence pattern', () => {
    const energyMap: EnergyMapRow[] = [
      { hour: 10, dow: 1, avgFulfillment: 2.6, totalMinutes: 60, entryCount: 3 },
      { hour: 14, dow: 3, avgFulfillment: 3.0, totalMinutes: 120, entryCount: 8 },
    ];
    const result = checkTimePatterns(energyMap, DEFAULT_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0]!.messageParams?.day).toBe('wed');
  });

  it('skips rows with null fulfillment', () => {
    const energyMap: EnergyMapRow[] = [
      { hour: 9, dow: 1, avgFulfillment: null, totalMinutes: 60, entryCount: 5 },
    ];
    const result = checkTimePatterns(energyMap, DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// checkPlanningAccuracy
// =============================================================================

describe('checkPlanningAccuracy', () => {
  it('returns empty when no tags have enough entries', () => {
    const data: EstimationAccuracyRow[] = [
      { tagId: '1', tagName: 'dev', avgDeviationMinutes: 5, entryCount: 2 },
    ];
    const result = checkPlanningAccuracy(data, DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });

  it('finds the most accurate tag', () => {
    const data: EstimationAccuracyRow[] = [
      { tagId: '1', tagName: 'dev', avgDeviationMinutes: 15, entryCount: 5 },
      { tagId: '2', tagName: 'meeting', avgDeviationMinutes: 3, entryCount: 4 },
      { tagId: '3', tagName: 'review', avgDeviationMinutes: -8, entryCount: 3 },
    ];
    const result = checkPlanningAccuracy(data, DEFAULT_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'planning_accuracy',
      messageKey: 'bestEstimationTag',
      messageParams: { tagName: 'meeting', deviation: 3 },
    });
  });

  it('returns empty when estimation data is empty', () => {
    const result = checkPlanningAccuracy([], DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// checkTrendComparisons
// =============================================================================

describe('checkTrendComparisons', () => {
  it('returns empty when no previous overview', () => {
    const result = checkTrendComparisons(makeOverview(), null, DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });

  it('returns empty when blank time delta is too small', () => {
    const current = makeOverview({
      blankRate: {
        availableMinutes: 480,
        scheduledMinutes: 300,
        blankMinutes: 180,
        blankRate: 0.375,
      },
    });
    const prev = makeOverview({
      blankRate: {
        availableMinutes: 480,
        scheduledMinutes: 305,
        blankMinutes: 175,
        blankRate: 0.365,
      },
    });
    const result = checkTrendComparisons(current, prev, DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });

  it('detects blank time increase', () => {
    const current = makeOverview({
      blankRate: {
        availableMinutes: 480,
        scheduledMinutes: 250,
        blankMinutes: 230,
        blankRate: 0.48,
      },
    });
    const prev = makeOverview({
      blankRate: {
        availableMinutes: 480,
        scheduledMinutes: 300,
        blankMinutes: 180,
        blankRate: 0.375,
      },
    });
    const result = checkTrendComparisons(current, prev, DEFAULT_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'trend_comparison',
      messageKey: 'blankTimeIncrease',
      messageParams: { minutes: 50 },
    });
  });

  it('detects blank time decrease', () => {
    const current = makeOverview({
      blankRate: {
        availableMinutes: 480,
        scheduledMinutes: 350,
        blankMinutes: 130,
        blankRate: 0.27,
      },
    });
    const prev = makeOverview({
      blankRate: {
        availableMinutes: 480,
        scheduledMinutes: 300,
        blankMinutes: 180,
        blankRate: 0.375,
      },
    });
    const result = checkTrendComparisons(current, prev, DEFAULT_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0]!.messageKey).toBe('blankTimeDecrease');
  });
});

// =============================================================================
// checkTagAffinity
// =============================================================================

describe('checkTagAffinity', () => {
  it('returns empty when fewer than 2 tags', () => {
    const tags: TimeByTagRow[] = [{ tagId: '1', name: 'dev', hours: 10, color: 'blue' }];
    const result = checkTagAffinity(tags, DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });

  it('detects dominant tag usage', () => {
    const tags: TimeByTagRow[] = [
      { tagId: '1', name: 'dev', hours: 20, color: 'blue' },
      { tagId: '2', name: 'meeting', hours: 5, color: 'green' },
      { tagId: '3', name: 'admin', hours: 3, color: 'gray' },
    ];
    const result = checkTagAffinity(tags, DEFAULT_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'tag_affinity',
      messageKey: 'topTagUsage',
      messageParams: { tagName: 'dev', percentage: 71 },
    });
  });

  it('returns empty when no tag exceeds 50%', () => {
    const tags: TimeByTagRow[] = [
      { tagId: '1', name: 'dev', hours: 10, color: 'blue' },
      { tagId: '2', name: 'meeting', hours: 8, color: 'green' },
      { tagId: '3', name: 'admin', hours: 7, color: 'gray' },
    ];
    const result = checkTagAffinity(tags, DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// checkConsistency
// =============================================================================

describe('checkConsistency', () => {
  it('returns empty when entry rate is below threshold', () => {
    const overview = makeOverview({
      entryRate: { totalEntries: 5, plannedEntries: 5, entryRate: 0.7 },
    });
    const result = checkConsistency(overview, DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });

  it('detects consistent recording', () => {
    const overview = makeOverview({
      entryRate: { totalEntries: 10, plannedEntries: 10, entryRate: 0.85 },
    });
    const result = checkConsistency(overview, DEFAULT_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'consistency',
      messageKey: 'consistentRecording',
      messageParams: { rate: 85 },
    });
  });
});

// =============================================================================
// evaluateDiscoveries (integration)
// =============================================================================

describe('evaluateDiscoveries', () => {
  it('returns empty array when all data is minimal', () => {
    const input: DiscoveryInput = {
      energyMap: [],
      estimationAccuracy: [],
      timeByTag: [],
      overview: makeOverview({
        entryRate: { totalEntries: 0, plannedEntries: 0, entryRate: 0 },
      }),
      prevOverview: null,
    };
    const result = evaluateDiscoveries(input);
    expect(result).toEqual([]);
  });

  it('limits results to maxResults', () => {
    const input: DiscoveryInput = {
      energyMap: [{ hour: 14, dow: 3, avgFulfillment: 3.0, totalMinutes: 120, entryCount: 10 }],
      estimationAccuracy: [{ tagId: '1', tagName: 'dev', avgDeviationMinutes: 2, entryCount: 5 }],
      timeByTag: [
        { tagId: '1', name: 'dev', hours: 20, color: 'blue' },
        { tagId: '2', name: 'misc', hours: 3, color: 'gray' },
      ],
      overview: makeOverview(),
      prevOverview: makeOverview({
        blankRate: {
          availableMinutes: 480,
          scheduledMinutes: 400,
          blankMinutes: 80,
          blankRate: 0.17,
        },
      }),
    };
    const result = evaluateDiscoveries(input, { maxResults: 2 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('sorts by confidence descending', () => {
    const input: DiscoveryInput = {
      energyMap: [{ hour: 14, dow: 3, avgFulfillment: 3.0, totalMinutes: 120, entryCount: 10 }],
      estimationAccuracy: [{ tagId: '1', tagName: 'dev', avgDeviationMinutes: 2, entryCount: 5 }],
      timeByTag: [
        { tagId: '1', name: 'dev', hours: 20, color: 'blue' },
        { tagId: '2', name: 'misc', hours: 3, color: 'gray' },
      ],
      overview: makeOverview(),
      prevOverview: null,
    };
    const result = evaluateDiscoveries(input);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.confidence).toBeGreaterThanOrEqual(result[i]!.confidence);
    }
  });
});
