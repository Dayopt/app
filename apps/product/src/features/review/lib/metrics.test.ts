import { describe, expect, it } from 'vitest';

import { Clock } from 'lucide-react';

import type { MetricDefinition } from '../types/metrics.types';

import {
  formatMetricValue,
  formatMetricValueParts,
  getMetricTrend,
  getThresholdStatus,
} from './metrics';

// =============================================================================
// formatMetricValue
// =============================================================================

describe('formatMetricValue', () => {
  describe('percentage', () => {
    it('formats 0.72 as 72%', () => {
      expect(formatMetricValue(0.72, 'percentage')).toBe('72%');
    });

    it('formats 0 as 0%', () => {
      expect(formatMetricValue(0, 'percentage')).toBe('0%');
    });

    it('formats 1 as 100%', () => {
      expect(formatMetricValue(1, 'percentage')).toBe('100%');
    });
  });

  describe('minutes', () => {
    it('formats 45 as 45m', () => {
      expect(formatMetricValue(45, 'minutes')).toBe('45m');
    });

    it('formats 90 as 1h 30m', () => {
      expect(formatMetricValue(90, 'minutes')).toBe('1h 30m');
    });

    it('formats 120 as 2h', () => {
      expect(formatMetricValue(120, 'minutes')).toBe('2h');
    });

    it('formats 0 as 0m', () => {
      expect(formatMetricValue(0, 'minutes')).toBe('0m');
    });
  });

  describe('duration', () => {
    it('formats 2295 (38h 15m) correctly', () => {
      expect(formatMetricValue(2295, 'duration')).toBe('38h 15m');
    });

    it('formats 60 as 1h', () => {
      expect(formatMetricValue(60, 'duration')).toBe('1h');
    });

    it('formats 30 as 30m', () => {
      expect(formatMetricValue(30, 'duration')).toBe('30m');
    });
  });

  describe('count', () => {
    it('formats integer as string', () => {
      expect(formatMetricValue(5, 'count')).toBe('5');
    });

    it('formats decimal with one digit', () => {
      expect(formatMetricValue(3.7, 'count')).toBe('3.7');
    });

    it('formats 0 as 0', () => {
      expect(formatMetricValue(0, 'count')).toBe('0');
    });
  });

  describe('score', () => {
    it('formats 3.8 as 3.8', () => {
      expect(formatMetricValue(3.8, 'score')).toBe('3.8');
    });

    it('formats integer with decimal', () => {
      expect(formatMetricValue(4, 'score')).toBe('4.0');
    });

    it('formats 0 as 0.0', () => {
      expect(formatMetricValue(0, 'score')).toBe('0.0');
    });
  });

  describe('days', () => {
    it('formats 23 as 23 days', () => {
      expect(formatMetricValue(23, 'days')).toBe('23 days');
    });

    it('formats 1 as 1 days', () => {
      expect(formatMetricValue(1, 'days')).toBe('1 days');
    });

    it('formats 0 as 0 days', () => {
      expect(formatMetricValue(0, 'days')).toBe('0 days');
    });
  });
});

// =============================================================================
// formatMetricValueParts
// =============================================================================

describe('formatMetricValueParts', () => {
  describe('percentage', () => {
    it('returns primary and % unit', () => {
      expect(formatMetricValueParts(0.72, 'percentage')).toEqual({ primary: '72', unit: '%' });
    });

    it('handles 0', () => {
      expect(formatMetricValueParts(0, 'percentage')).toEqual({ primary: '0', unit: '%' });
    });

    it('handles 100%', () => {
      expect(formatMetricValueParts(1, 'percentage')).toEqual({ primary: '100', unit: '%' });
    });
  });

  describe('duration / minutes', () => {
    it('formats minutes < 60 as primary + m', () => {
      expect(formatMetricValueParts(45, 'minutes')).toEqual({ primary: '45', unit: 'm' });
    });

    it('formats hours+minutes with secondary', () => {
      expect(formatMetricValueParts(90, 'duration')).toEqual({
        primary: '1',
        unit: 'h',
        secondary: '30',
        secondaryUnit: 'm',
      });
    });

    it('formats exact hours without secondary', () => {
      expect(formatMetricValueParts(120, 'duration')).toEqual({ primary: '2', unit: 'h' });
    });

    it('formats large duration with secondary', () => {
      expect(formatMetricValueParts(2295, 'duration')).toEqual({
        primary: '38',
        unit: 'h',
        secondary: '15',
        secondaryUnit: 'm',
      });
    });

    it('formats 0 as 0m', () => {
      expect(formatMetricValueParts(0, 'minutes')).toEqual({ primary: '0', unit: 'm' });
    });
  });

  describe('count', () => {
    it('formats integer', () => {
      expect(formatMetricValueParts(5, 'count')).toEqual({ primary: '5', unit: '' });
    });

    it('formats decimal', () => {
      expect(formatMetricValueParts(3.7, 'count')).toEqual({ primary: '3.7', unit: '' });
    });
  });

  describe('score', () => {
    it('formats with one decimal', () => {
      expect(formatMetricValueParts(3.8, 'score')).toEqual({ primary: '3.8', unit: '' });
    });

    it('formats integer with .0', () => {
      expect(formatMetricValueParts(4, 'score')).toEqual({ primary: '4.0', unit: '' });
    });
  });

  describe('days', () => {
    it('formats days', () => {
      expect(formatMetricValueParts(23, 'days')).toEqual({ primary: '23', unit: 'days' });
    });
  });
});

// =============================================================================
// getMetricTrend
// =============================================================================

describe('getMetricTrend', () => {
  it('returns flat when both values are 0', () => {
    expect(getMetricTrend(0, 0)).toEqual({ direction: 'flat', delta: 0, isPositive: true });
  });

  it('returns up when previous is 0 and current is positive (trendPositive: up)', () => {
    expect(getMetricTrend(5, 0, 'up')).toEqual({
      direction: 'up',
      delta: 1,
      isPositive: true,
    });
  });

  it('returns up when previous is 0 and current is positive (trendPositive: down)', () => {
    expect(getMetricTrend(5, 0, 'down')).toEqual({
      direction: 'up',
      delta: 1,
      isPositive: false,
    });
  });

  it('returns up with isPositive=true for significant increase (trendPositive: up)', () => {
    const result = getMetricTrend(120, 100, 'up');
    expect(result.direction).toBe('up');
    expect(result.isPositive).toBe(true);
    expect(result.delta).toBeCloseTo(0.2);
  });

  it('returns down with isPositive=true for significant decrease (trendPositive: down)', () => {
    const result = getMetricTrend(80, 100, 'down');
    expect(result.direction).toBe('down');
    expect(result.isPositive).toBe(true);
    expect(result.delta).toBeCloseTo(-0.2);
  });

  it('returns down with isPositive=false for decrease (trendPositive: up)', () => {
    const result = getMetricTrend(80, 100, 'up');
    expect(result.direction).toBe('down');
    expect(result.isPositive).toBe(false);
  });

  it('returns up with isPositive=false for increase (trendPositive: down)', () => {
    const result = getMetricTrend(120, 100, 'down');
    expect(result.direction).toBe('up');
    expect(result.isPositive).toBe(false);
  });

  it('returns flat for small changes under 5%', () => {
    const result = getMetricTrend(102, 100);
    expect(result.direction).toBe('flat');
    expect(result.isPositive).toBe(true);
  });

  it('defaults trendPositive to up', () => {
    const result = getMetricTrend(120, 100);
    expect(result.isPositive).toBe(true);
  });
});

// =============================================================================
// getThresholdStatus
// =============================================================================

describe('getThresholdStatus', () => {
  const planRateDef: MetricDefinition = {
    id: 'planRate',
    format: 'percentage',
    trendPositive: 'up',
    thresholds: { good: 0.7, warning: 0.4 },
    icon: Clock,
  };

  const blankRateDef: MetricDefinition = {
    id: 'blankRate',
    format: 'percentage',
    trendPositive: 'down',
    thresholds: { good: 0.15, warning: 0.4 },
    icon: Clock,
  };

  const noThresholdDef: MetricDefinition = {
    id: 'totalTime',
    format: 'duration',
    trendPositive: 'up',
    icon: Clock,
  };

  describe('trendPositive: up (higher is better)', () => {
    it('returns good when value >= good threshold', () => {
      expect(getThresholdStatus(0.8, planRateDef)).toBe('good');
    });

    it('returns good at exact good threshold', () => {
      expect(getThresholdStatus(0.7, planRateDef)).toBe('good');
    });

    it('returns warning when value >= warning but < good', () => {
      expect(getThresholdStatus(0.5, planRateDef)).toBe('warning');
    });

    it('returns critical when value < warning', () => {
      expect(getThresholdStatus(0.3, planRateDef)).toBe('critical');
    });
  });

  describe('trendPositive: down (lower is better)', () => {
    it('returns good when value <= good threshold', () => {
      expect(getThresholdStatus(0.1, blankRateDef)).toBe('good');
    });

    it('returns good at exact good threshold', () => {
      expect(getThresholdStatus(0.15, blankRateDef)).toBe('good');
    });

    it('returns warning when value <= warning but > good', () => {
      expect(getThresholdStatus(0.3, blankRateDef)).toBe('warning');
    });

    it('returns critical when value > warning', () => {
      expect(getThresholdStatus(0.5, blankRateDef)).toBe('critical');
    });
  });

  it('returns null when no thresholds defined', () => {
    expect(getThresholdStatus(100, noThresholdDef)).toBeNull();
  });
});
