import { describe, expect, it } from 'vitest';

import { computeTimeDiff } from '../time-diff';

describe('computeTimeDiff', () => {
  describe('hasActual フラグ', () => {
    it('actualStart / actualEnd の両方が null なら false', () => {
      const result = computeTimeDiff('09:00', '10:00', null, null);
      expect(result.hasActual).toBe(false);
    });

    it('actualStart のみあれば true', () => {
      const result = computeTimeDiff('09:00', '10:00', '09:05', null);
      expect(result.hasActual).toBe(true);
    });

    it('actualEnd のみあれば true', () => {
      const result = computeTimeDiff('09:00', '10:00', null, '10:05');
      expect(result.hasActual).toBe(true);
    });
  });

  describe('開始差分の符号規約', () => {
    it('予定通り開始なら startDiffMin=0 / topKind=none', () => {
      const result = computeTimeDiff('09:00', '10:00', '09:00', '10:00');
      expect(result.startDiffMin).toBe(0);
      expect(result.topKind).toBe('none');
    });

    it('遅れて開始は startDiffMin>0 / topKind=unexecuted', () => {
      // 09:00 予定 → 09:15 開始 = 15 分遅れ
      const result = computeTimeDiff('09:00', '10:00', '09:15', '10:00');
      expect(result.startDiffMin).toBe(15);
      expect(result.topKind).toBe('unexecuted');
    });

    it('早く開始は startDiffMin<0 / topKind=overtime', () => {
      // 09:00 予定 → 08:50 開始 = 10 分前倒し
      const result = computeTimeDiff('09:00', '10:00', '08:50', '10:00');
      expect(result.startDiffMin).toBe(-10);
      expect(result.topKind).toBe('overtime');
    });
  });

  describe('終了差分の符号規約', () => {
    it('予定通り終了なら endDiffMin=0 / bottomKind=none', () => {
      const result = computeTimeDiff('09:00', '10:00', '09:00', '10:00');
      expect(result.endDiffMin).toBe(0);
      expect(result.bottomKind).toBe('none');
    });

    it('早く終了は endDiffMin<0 / bottomKind=unexecuted', () => {
      // 10:00 予定 → 09:45 終了 = 15 分早め
      const result = computeTimeDiff('09:00', '10:00', '09:00', '09:45');
      expect(result.endDiffMin).toBe(-15);
      expect(result.bottomKind).toBe('unexecuted');
    });

    it('遅く終了は endDiffMin>0 / bottomKind=overtime', () => {
      // 10:00 予定 → 10:20 終了 = 20 分超過
      const result = computeTimeDiff('09:00', '10:00', '09:00', '10:20');
      expect(result.endDiffMin).toBe(20);
      expect(result.bottomKind).toBe('overtime');
    });
  });

  describe('duration 計算', () => {
    it('plannedDuration = pEnd - pStart', () => {
      const result = computeTimeDiff('09:00', '10:30', '09:00', '10:30');
      expect(result.plannedDuration).toBe(90);
    });

    it('actualDuration = aEnd - aStart', () => {
      const result = computeTimeDiff('09:00', '10:00', '09:10', '09:50');
      expect(result.actualDuration).toBe(40);
    });

    it('予定が逆転（pEnd < pStart）でも plannedDuration は 0 にクランプされる', () => {
      const result = computeTimeDiff('10:00', '09:00', '10:00', '09:00');
      expect(result.plannedDuration).toBe(0);
      expect(result.actualDuration).toBe(0);
    });

    it('totalDiffMin = actualDuration - plannedDuration', () => {
      // 60 分予定 → 40 分実行 = -20 分
      const result = computeTimeDiff('09:00', '10:00', '09:10', '09:50');
      expect(result.totalDiffMin).toBe(-20);
    });
  });

  describe('actual が片方だけ null の場合は予定通り扱い', () => {
    it('actualStart=null は plannedStart と同等として扱う', () => {
      const result = computeTimeDiff('09:00', '10:00', null, '10:30');
      expect(result.startDiffMin).toBe(0);
      expect(result.topKind).toBe('none');
      // actualDuration は 09:00–10:30 = 90
      expect(result.actualDuration).toBe(90);
    });

    it('actualEnd=null は plannedEnd と同等として扱う', () => {
      const result = computeTimeDiff('09:00', '10:00', '08:45', null);
      expect(result.endDiffMin).toBe(0);
      expect(result.bottomKind).toBe('none');
      expect(result.actualDuration).toBe(75);
    });
  });

  describe('HH:MM パース', () => {
    it('00:00 / 23:59 などの境界値を正しく分換算する', () => {
      const result = computeTimeDiff('00:00', '23:59', '00:00', '23:59');
      expect(result.plannedDuration).toBe(23 * 60 + 59);
    });
  });
});
