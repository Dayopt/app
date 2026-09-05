import { describe, expect, it } from 'vitest';

import {
  materializeTemplateDay,
  PlanTemplateMaterializeError,
  resolveTemplateBlockMinutes,
  type TemplateBlockShape,
} from './plan-template-materialize';

const ACTIVITY_A = '00000000-0000-4000-8000-0000000000a1';
const ACTIVITY_B = '00000000-0000-4000-8000-0000000000b1';

function block(
  id: string,
  anchorMinute: number,
  activityId: string | null = ACTIVITY_A,
): TemplateBlockShape {
  return { id, activityId, title: `block-${id}`, anchorMinute };
}

function positioned(id: string, positionMinutes: number, activityId: string | null = ACTIVITY_A) {
  return { id, activityId, positionMinutes };
}

const NO_MEDIANS: ReadonlyMap<string, number> = new Map();
const NO_ARCHIVED: ReadonlySet<string> = new Set();

describe('resolveTemplateBlockMinutes', () => {
  it('中央値があればそれを、無ければ既定長を着せる', () => {
    const minutes = resolveTemplateBlockMinutes(
      [
        positioned('a', 9 * 60, ACTIVITY_A),
        positioned('b', 14 * 60, ACTIVITY_B),
        positioned('c', 18 * 60, null),
      ],
      new Map([[ACTIVITY_A, 45]]),
      60,
    );
    expect(minutes.get('a')).toBe(45);
    expect(minutes.get('b')).toBe(60);
    expect(minutes.get('c')).toBe(60);
  });

  it('次の錨までで clip する（半開区間なので先行 end = 次 start は許容）', () => {
    const minutes = resolveTemplateBlockMinutes(
      [positioned('a', 9 * 60), positioned('b', 9 * 60 + 30)],
      new Map([[ACTIVITY_A, 90]]),
      60,
    );
    expect(minutes.get('a')).toBe(30);
    expect(minutes.get('b')).toBe(90);
  });

  it('最終ブロックは日末までで clip する', () => {
    const minutes = resolveTemplateBlockMinutes([positioned('a', 23 * 60)], NO_MEDIANS, 120);
    expect(minutes.get('a')).toBe(60);
  });

  it('既定長も 5 分丸めと上限を通る', () => {
    const minutes = resolveTemplateBlockMinutes([positioned('a', 0)], NO_MEDIANS, 63);
    expect(minutes.get('a')).toBe(65);
  });
});

describe('materializeTemplateDay', () => {
  it('錨順に UTC の start / end を作る（Asia/Tokyo）', () => {
    const plans = materializeTemplateDay({
      blocks: [block('b', 12 * 60, ACTIVITY_B), block('a', 9 * 60, ACTIVITY_A)],
      dateKey: '2026-09-05',
      timezone: 'Asia/Tokyo',
      medianMinutesByActivity: new Map([
        [ACTIVITY_A, 90],
        [ACTIVITY_B, 30],
      ]),
      defaultMinutes: 60,
      archivedActivityIds: NO_ARCHIVED,
    });
    expect(plans).toEqual([
      {
        blockId: 'a',
        activityId: ACTIVITY_A,
        title: 'block-a',
        startAt: '2026-09-05T00:00:00.000Z',
        endAt: '2026-09-05T01:30:00.000Z',
      },
      {
        blockId: 'b',
        activityId: ACTIVITY_B,
        title: 'block-b',
        startAt: '2026-09-05T03:00:00.000Z',
        endAt: '2026-09-05T03:30:00.000Z',
      },
    ]);
  });

  it('archived な activity は activity 無し・title 保持で具現化し、ブロックを減らさない', () => {
    const plans = materializeTemplateDay({
      blocks: [block('a', 9 * 60, ACTIVITY_A), block('b', 10 * 60, ACTIVITY_B)],
      dateKey: '2026-09-05',
      timezone: 'UTC',
      medianMinutesByActivity: NO_MEDIANS,
      defaultMinutes: 30,
      archivedActivityIds: new Set([ACTIVITY_A]),
    });
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ activityId: null, title: 'block-a' });
    expect(plans[1]).toMatchObject({ activityId: ACTIVITY_B });
  });

  it('空の型は EMPTY_TEMPLATE', () => {
    expect(() =>
      materializeTemplateDay({
        blocks: [],
        dateKey: '2026-09-05',
        timezone: 'UTC',
        medianMinutesByActivity: NO_MEDIANS,
        defaultMinutes: 60,
        archivedActivityIds: NO_ARCHIVED,
      }),
    ).toThrow(PlanTemplateMaterializeError);
  });

  it('spring forward 日に gap を跨ぐ錨は前方へ送られ、次の錨と衝突して 5 分未満なら全体拒否', () => {
    // 02:30 は 03:30 EDT へ、03:32 はそのまま → 2 分しか無い
    expect(() =>
      materializeTemplateDay({
        blocks: [block('a', 150), block('b', 3 * 60 + 32)],
        dateKey: '2025-03-09',
        timezone: 'America/New_York',
        medianMinutesByActivity: NO_MEDIANS,
        defaultMinutes: 60,
        archivedActivityIds: NO_ARCHIVED,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'BLOCK_TOO_SHORT',
      }) as unknown as PlanTemplateMaterializeError,
    );
  });

  it('spring forward 日に gap 内の錨は 03:00 台の錨より後ろへ並び直され、組成は保たれる', () => {
    // 02:30 → 03:30 EDT（07:30Z）、03:15 EDT は 07:15Z。instant 順に置き、03:15 は 15 分で切れる
    const plans = materializeTemplateDay({
      blocks: [block('gap', 150), block('after', 195)],
      dateKey: '2025-03-09',
      timezone: 'America/New_York',
      medianMinutesByActivity: NO_MEDIANS,
      defaultMinutes: 60,
      archivedActivityIds: NO_ARCHIVED,
    });
    expect(plans.map((plan) => plan.blockId)).toEqual(['after', 'gap']);
    expect(plans[0]).toMatchObject({
      startAt: '2025-03-09T07:15:00.000Z',
      endAt: '2025-03-09T07:30:00.000Z',
    });
    expect(plans[1]).toMatchObject({
      startAt: '2025-03-09T07:30:00.000Z',
      endAt: '2025-03-09T08:30:00.000Z',
    });
  });

  it('spring forward 日の gap 前ブロックは実経過分ではなく次の錨で切れる', () => {
    // 01:30 EST（06:30Z）に 60 分 → 02:30 は存在しないので instant 上は 07:30Z（03:30 EDT）。
    // 次の錨 03:00 EDT（07:00Z）が先に来るので end は 07:00Z（実経過 30 分）
    const plans = materializeTemplateDay({
      blocks: [block('a', 90), block('b', 180)],
      dateKey: '2025-03-09',
      timezone: 'America/New_York',
      medianMinutesByActivity: NO_MEDIANS,
      defaultMinutes: 60,
      archivedActivityIds: NO_ARCHIVED,
    });
    expect(plans[0]).toMatchObject({
      startAt: '2025-03-09T06:30:00.000Z',
      endAt: '2025-03-09T07:00:00.000Z',
    });
    expect(plans[1]).toMatchObject({
      startAt: '2025-03-09T07:00:00.000Z',
      endAt: '2025-03-09T08:00:00.000Z',
    });
  });

  it('fall back 日の最終ブロックは 25 時間目の日末で切れる', () => {
    const plans = materializeTemplateDay({
      blocks: [block('a', 23 * 60 + 30)],
      dateKey: '2025-11-02',
      timezone: 'America/New_York',
      medianMinutesByActivity: new Map([[ACTIVITY_A, 8 * 60]]),
      defaultMinutes: 60,
      archivedActivityIds: NO_ARCHIVED,
    });
    expect(plans[0]).toMatchObject({
      startAt: '2025-11-03T04:30:00.000Z',
      endAt: '2025-11-03T05:00:00.000Z',
    });
  });

  it('過去の日にもそのまま Plan として置ける（時刻で操作を出し分けない）', () => {
    const plans = materializeTemplateDay({
      blocks: [block('a', 9 * 60)],
      dateKey: '2020-01-01',
      timezone: 'UTC',
      medianMinutesByActivity: NO_MEDIANS,
      defaultMinutes: 60,
      archivedActivityIds: NO_ARCHIVED,
    });
    expect(plans[0]).toMatchObject({
      startAt: '2020-01-01T09:00:00.000Z',
      endAt: '2020-01-01T10:00:00.000Z',
    });
  });
});
