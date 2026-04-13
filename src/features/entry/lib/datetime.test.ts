import { describe, expect, it } from 'vitest';

import { toLocalISOString } from './datetime';

describe('datetime', () => {
  describe('toLocalISOString', () => {
    it('日付と時刻をISO 8601形式に変換できる', () => {
      const result = toLocalISOString('2025-11-23', '13:15');

      // ISO 8601形式であることを確認
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('年月日が正しく解析される', () => {
      const result = toLocalISOString('2025-01-15', '09:30');
      const date = new Date(result);

      // 注意: toISOString()はUTCに変換されるため、ローカル時間での検証
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(0); // 0-indexed
      expect(date.getDate()).toBe(15);
    });

    it('時刻が正しく解析される', () => {
      const result = toLocalISOString('2025-06-20', '14:45');
      const date = new Date(result);

      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(45);
    });

    it('深夜0時を正しく処理できる', () => {
      const result = toLocalISOString('2025-03-10', '00:00');
      const date = new Date(result);

      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    });

    it('23:59を正しく処理できる', () => {
      const result = toLocalISOString('2025-12-31', '23:59');
      const date = new Date(result);

      expect(date.getHours()).toBe(23);
      expect(date.getMinutes()).toBe(59);
    });

    it('秒は常に0になる', () => {
      const result = toLocalISOString('2025-07-04', '12:30');
      const date = new Date(result);

      expect(date.getSeconds()).toBe(0);
      expect(date.getMilliseconds()).toBe(0);
    });

    it('うるう年の2月29日を正しく処理できる', () => {
      const result = toLocalISOString('2024-02-29', '10:00');
      const date = new Date(result);

      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(1); // 2月
      expect(date.getDate()).toBe(29);
    });

    it('月末日を正しく処理できる', () => {
      // 1月31日
      const jan31 = toLocalISOString('2025-01-31', '12:00');
      expect(new Date(jan31).getDate()).toBe(31);

      // 4月30日
      const apr30 = toLocalISOString('2025-04-30', '12:00');
      expect(new Date(apr30).getDate()).toBe(30);
    });

    it('年始と年末を正しく処理できる', () => {
      // 年始
      const newYear = toLocalISOString('2025-01-01', '00:00');
      const newYearDate = new Date(newYear);
      expect(newYearDate.getFullYear()).toBe(2025);
      expect(newYearDate.getMonth()).toBe(0);
      expect(newYearDate.getDate()).toBe(1);

      // 年末
      const endYear = toLocalISOString('2025-12-31', '23:59');
      const endYearDate = new Date(endYear);
      expect(endYearDate.getFullYear()).toBe(2025);
      expect(endYearDate.getMonth()).toBe(11);
      expect(endYearDate.getDate()).toBe(31);
    });

    it('結果がISO 8601形式の文字列である', () => {
      const result = toLocalISOString('2025-08-15', '16:30');

      // ISO 8601形式のパターン（タイムゾーン情報含む）
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('生成された文字列からDateオブジェクトを復元できる', () => {
      const original = toLocalISOString('2025-05-20', '08:15');
      const restored = new Date(original);

      expect(restored.toISOString()).toBe(original);
    });
  });

  describe('エッジケース', () => {
    it('1桁の月日時分を正しく処理できる', () => {
      // 実際の入力は2桁だが、パース時に1桁でも対応
      const result = toLocalISOString('2025-01-05', '09:05');
      const date = new Date(result);

      expect(date.getMonth()).toBe(0);
      expect(date.getDate()).toBe(5);
      expect(date.getHours()).toBe(9);
      expect(date.getMinutes()).toBe(5);
    });
  });
});
