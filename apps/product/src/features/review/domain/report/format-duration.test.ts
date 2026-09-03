import { describe, expect, it } from 'vitest';

import { formatReportDelta, formatReportDuration } from './format-duration';

describe('formatReportDuration', () => {
  it('h:mm で返し、時はゼロ埋めしない', () => {
    expect(formatReportDuration(45)).toBe('0:45');
    expect(formatReportDuration(840)).toBe('14:00');
    expect(formatReportDuration(5560)).toBe('92:40');
  });

  it('0 は 0:00', () => {
    expect(formatReportDuration(0)).toBe('0:00');
  });

  it('分は 2 桁でゼロ埋めする', () => {
    expect(formatReportDuration(65)).toBe('1:05');
  });

  it('小数の分を丸める', () => {
    expect(formatReportDuration(90.4)).toBe('1:30');
    expect(formatReportDuration(90.6)).toBe('1:31');
  });

  it('時間が 3 桁以上でも切らない（年粒度）', () => {
    expect(formatReportDuration(60 * 1234)).toBe('1234:00');
  });

  it('負の値は絶対値で返す（符号は呼び出し側が付ける）', () => {
    expect(formatReportDuration(-90)).toBe('1:30');
  });

  it('59.6 分は繰り上がって 1:00 になる', () => {
    expect(formatReportDuration(59.6)).toBe('1:00');
  });
});

describe('formatReportDelta', () => {
  it('増減に符号を付ける', () => {
    expect(formatReportDelta(130)).toBe('+2:10');
    expect(formatReportDelta(-40)).toBe('−0:40');
  });

  it('0 には符号を付けない', () => {
    expect(formatReportDelta(0)).toBe('0:00');
    expect(formatReportDelta(0.4)).toBe('0:00');
  });

  it('マイナス記号は U+2212（ハイフンではない）', () => {
    expect(formatReportDelta(-40).charCodeAt(0)).toBe(0x2212);
  });
});
