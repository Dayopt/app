/**
 * Sample Plans Unit Tests
 *
 * generateSampleEntriesのビジネスロジックをテスト
 */

import { describe, expect, it } from 'vitest';

import { generateSampleEntries, PRESET_TAGS } from '../lib/sample-entries';

describe('generateSampleEntries', () => {
  const testDate = new Date('2026-03-24T00:00:00');

  it('should generate 7 sample plans', () => {
    const plans = generateSampleEntries('bear', testDate);

    expect(plans).toHaveLength(7);
  });

  it('should use bear peak time (10:00) for bear chronotype', () => {
    const plans = generateSampleEntries('bear', testDate);

    // First plan: Morning Run, offset -2h from peak 10:00 → 08:00
    const morningRun = plans[0]!;
    expect(morningRun.title).toBe('Morning Run');
    const startTime = new Date(morningRun.startTime);
    expect(startTime.getHours()).toBe(8);
    expect(startTime.getMinutes()).toBe(0);
  });

  it('should use lion peak time (7:00) for lion chronotype', () => {
    const plans = generateSampleEntries('lion', testDate);

    // First plan: Morning Run, offset -2h from peak 7:00 → 05:00
    const morningRun = plans[0]!;
    const startTime = new Date(morningRun.startTime);
    expect(startTime.getHours()).toBe(5);
  });

  it('should use wolf peak time (15:00) for wolf chronotype', () => {
    const plans = generateSampleEntries('wolf', testDate);

    // First plan: Morning Run, offset -2h from peak 15:00 → 13:00
    const morningRun = plans[0]!;
    const startTime = new Date(morningRun.startTime);
    expect(startTime.getHours()).toBe(13);
  });

  it('should use dolphin peak time (8:00) for dolphin chronotype', () => {
    const plans = generateSampleEntries('dolphin', testDate);

    // First plan: Morning Run, offset -2h from peak 8:00 → 06:00
    const morningRun = plans[0]!;
    const startTime = new Date(morningRun.startTime);
    expect(startTime.getHours()).toBe(6);
  });

  it('should default to bear when chronotype is null', () => {
    const plansNull = generateSampleEntries(null, testDate);
    const plansBear = generateSampleEntries('bear', testDate);

    expect(plansNull).toEqual(plansBear);
  });

  it('should set correct endTime based on duration', () => {
    const plans = generateSampleEntries('bear', testDate);

    // Morning Run: 30 minutes
    const morningRun = plans[0]!;
    const start = new Date(morningRun.startTime);
    const end = new Date(morningRun.endTime);
    const durationMs = end.getTime() - start.getTime();
    expect(durationMs / 60000).toBe(30);

    // Draft Proposal: 90 minutes
    const proposal = plans[1]!;
    const propStart = new Date(proposal.startTime);
    const propEnd = new Date(proposal.endTime);
    expect((propEnd.getTime() - propStart.getTime()) / 60000).toBe(90);
  });

  it('should include correct tag keys', () => {
    const plans = generateSampleEntries('bear', testDate);

    const tagKeys = plans.map((p) => p.tagKey);
    expect(tagKeys).toContain('exercise');
    expect(tagKeys).toContain('work');
    expect(tagKeys).toContain('learning');
    expect(tagKeys).toContain('life');
    expect(tagKeys).toContain('hobby');
  });

  it('should set description correctly', () => {
    const plans = generateSampleEntries('bear', testDate);

    // Draft Proposal has no description
    const proposal = plans[1]!;
    expect(proposal.description).toBeNull();

    // English Lesson has description
    const lesson = plans[2]!;
    expect(lesson.description).toBe('Unit 5 — Pronunciation practice');

    // Morning Run has no description
    const morningRun = plans[0]!;
    expect(morningRun.description).toBeNull();
  });
});

describe('PRESET_TAGS', () => {
  it('should have 5 preset tags', () => {
    expect(Object.keys(PRESET_TAGS)).toHaveLength(5);
  });

  it('should have name and color for each tag', () => {
    for (const [, tag] of Object.entries(PRESET_TAGS)) {
      expect(tag.name).toBeTruthy();
      expect(tag.color).toBeTruthy();
    }
  });
});
