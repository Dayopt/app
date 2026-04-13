import { describe, expect, it } from 'vitest';

import { createEntrySchema, updateEntrySchema } from '../entry';

function validEntry(overrides = {}) {
  return {
    title: 'Test Entry',
    ...overrides,
  };
}

describe('createEntrySchema — timeOrderRefine バリデーション', () => {
  describe('正常ケース（バリデーション通過）', () => {
    it('start_time < end_time は valid', () => {
      const result = createEntrySchema.safeParse(
        validEntry({
          start_time: '2025-03-15T09:00:00Z',
          end_time: '2025-03-15T10:00:00Z',
        }),
      );
      expect(result.success).toBe(true);
    });

    it('start_time === end_time は valid（等しいは許可）', () => {
      const result = createEntrySchema.safeParse(
        validEntry({
          start_time: '2025-03-15T09:00:00Z',
          end_time: '2025-03-15T09:00:00Z',
        }),
      );
      expect(result.success).toBe(true);
    });

    it('start_time と end_time が両方 null は valid', () => {
      const result = createEntrySchema.safeParse(
        validEntry({
          start_time: null,
          end_time: null,
        }),
      );
      expect(result.success).toBe(true);
    });

    it('start_time のみ設定（end_time は null）は valid', () => {
      const result = createEntrySchema.safeParse(
        validEntry({
          start_time: '2025-03-15T09:00:00Z',
          end_time: null,
        }),
      );
      expect(result.success).toBe(true);
    });

    it('end_time のみ設定（start_time は null）は valid', () => {
      const result = createEntrySchema.safeParse(
        validEntry({
          start_time: null,
          end_time: '2025-03-15T10:00:00Z',
        }),
      );
      expect(result.success).toBe(true);
    });

    it('actual_start_time < actual_end_time は valid', () => {
      const result = createEntrySchema.safeParse(
        validEntry({
          actual_start_time: '2025-03-15T09:00:00Z',
          actual_end_time: '2025-03-15T10:00:00Z',
        }),
      );
      expect(result.success).toBe(true);
    });

    it('actual_start_time === actual_end_time は valid', () => {
      const result = createEntrySchema.safeParse(
        validEntry({
          actual_start_time: '2025-03-15T09:00:00Z',
          actual_end_time: '2025-03-15T09:00:00Z',
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('エラーケース（バリデーション失敗）', () => {
    it('end_time < start_time でエラー（path: end_time）', () => {
      const result = createEntrySchema.safeParse(
        validEntry({
          start_time: '2025-03-15T10:00:00Z',
          end_time: '2025-03-15T09:00:00Z',
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const endTimeIssue = result.error.issues.find((i) => i.path.includes('end_time'));
        expect(endTimeIssue).toBeDefined();
        expect(endTimeIssue?.message).toBe('validation.time.endBeforeStart');
      }
    });

    it('actual_end_time < actual_start_time でエラー（path: actual_end_time）', () => {
      const result = createEntrySchema.safeParse(
        validEntry({
          actual_start_time: '2025-03-15T10:00:00Z',
          actual_end_time: '2025-03-15T09:00:00Z',
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('actual_end_time'));
        expect(issue).toBeDefined();
        expect(issue?.message).toBe('validation.time.endBeforeStart');
      }
    });

    it('planned と actual 両方逆順の場合は 2 つのエラー', () => {
      const result = createEntrySchema.safeParse(
        validEntry({
          start_time: '2025-03-15T10:00:00Z',
          end_time: '2025-03-15T09:00:00Z',
          actual_start_time: '2025-03-15T10:00:00Z',
          actual_end_time: '2025-03-15T09:00:00Z',
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(2);
      }
    });
  });

  describe('title のバリデーション', () => {
    it('200文字は valid', () => {
      const result = createEntrySchema.safeParse(validEntry({ title: 'a'.repeat(200) }));
      expect(result.success).toBe(true);
    });

    it('201文字は invalid（maxLength）', () => {
      const result = createEntrySchema.safeParse(validEntry({ title: 'a'.repeat(201) }));
      expect(result.success).toBe(false);
    });

    it('空文字は valid（min なし）', () => {
      const result = createEntrySchema.safeParse(validEntry({ title: '' }));
      expect(result.success).toBe(true);
    });
  });

  describe('fulfillment_score のバリデーション', () => {
    it('1, 2, 3 はすべて valid', () => {
      expect(createEntrySchema.safeParse(validEntry({ fulfillment_score: 1 })).success).toBe(true);
      expect(createEntrySchema.safeParse(validEntry({ fulfillment_score: 2 })).success).toBe(true);
      expect(createEntrySchema.safeParse(validEntry({ fulfillment_score: 3 })).success).toBe(true);
    });

    it('0 は invalid（min(1)）', () => {
      expect(createEntrySchema.safeParse(validEntry({ fulfillment_score: 0 })).success).toBe(false);
    });

    it('4 は invalid（max(3)）', () => {
      expect(createEntrySchema.safeParse(validEntry({ fulfillment_score: 4 })).success).toBe(false);
    });

    it('null は valid（nullable）', () => {
      expect(createEntrySchema.safeParse(validEntry({ fulfillment_score: null })).success).toBe(
        true,
      );
    });
  });
});

describe('updateEntrySchema — partial フィールドの振る舞い', () => {
  it('すべてのフィールドが省略可能（空オブジェクト valid）', () => {
    const result = updateEntrySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('title のみの部分更新は valid', () => {
    const result = updateEntrySchema.safeParse({ title: 'Updated' });
    expect(result.success).toBe(true);
  });

  it('end_time のみ（start_time なし）では timeOrderRefine はスキップ', () => {
    const result = updateEntrySchema.safeParse({ end_time: '2025-03-15T09:00:00Z' });
    expect(result.success).toBe(true);
  });
});
