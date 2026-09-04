import { describe, expect, it } from 'vitest';

import {
  answerCountOf,
  applySegmentLens,
  buildAllocationSlices,
  buildCompassPoints,
  buildCompassWaitingList,
  buildExecutionRows,
  buildInkColumns,
  buildMirrorRows,
  buildSegmentBars,
  computeDenominators,
  computePreviousDelta,
  computeUncategorizedPercent,
  defaultReportFilterState,
  maxInkColumnMinutes,
  resolveVisibleActivities,
  toPercent,
  UNCATEGORIZED_KEY,
} from './report-view-model';

import type { ReportActivityAggregate } from '../../server/report-aggregation-service';

function activity(overrides: Partial<ReportActivityAggregate> = {}): ReportActivityAggregate {
  return {
    activityId: 'a1',
    activityName: '執筆',
    categoryId: 'c1',
    categoryName: '仕事',
    categoryColor: 'blue',
    categoryIcon: 'pen',
    archived: false,
    recordedMinutes: 0,
    plannedMinutes: 0,
    plannedPastMinutes: 0,
    plannedPastBoxes: 0,
    recordBoxes: 0,
    fulfillment: { low: 0, medium: 0, high: 0 },
    byBucket: [0, 0, 0, 0, 0, 0, 0],
    ...overrides,
  };
}

describe('resolveVisibleActivities', () => {
  const rows = [
    activity({ activityId: 'a1', categoryId: 'c1' }),
    activity({ activityId: 'a2', categoryId: 'c2' }),
    activity({ activityId: 'a3', categoryId: null, categoryName: null }),
  ];

  it('既定では全部見える', () => {
    expect(resolveVisibleActivities(rows, defaultReportFilterState)).toHaveLength(3);
  });

  it('hidden に載ったカテゴリだけ落とす', () => {
    const visible = resolveVisibleActivities(rows, {
      ...defaultReportFilterState,
      hiddenCategoryIds: ['c1'],
    });

    expect(visible.map((row) => row.activityId)).toEqual(['a2', 'a3']);
  });

  it('新しいカテゴリは hidden に載っていないので自動で見える', () => {
    const withNew = [...rows, activity({ activityId: 'a4', categoryId: 'c-new' })];

    const visible = resolveVisibleActivities(withNew, {
      ...defaultReportFilterState,
      hiddenCategoryIds: ['c1'],
    });

    expect(visible.map((row) => row.activityId)).toContain('a4');
  });

  it('未分類を隠すとカテゴリー未設定だけ落ちる', () => {
    const visible = resolveVisibleActivities(rows, {
      ...defaultReportFilterState,
      uncategorizedHidden: true,
    });

    expect(visible.map((row) => row.activityId)).toEqual(['a1', 'a2']);
  });
});

describe('applySegmentLens', () => {
  const rows = [
    activity({ activityId: 'a1' }),
    activity({ activityId: 'a2' }),
    activity({ activityId: null }),
  ];

  it('null（すべて）なら素通し', () => {
    expect(applySegmentLens(rows, null)).toHaveLength(3);
  });

  it('メンバーだけに絞る', () => {
    expect(applySegmentLens(rows, ['a2']).map((row) => row.activityId)).toEqual(['a2']);
  });

  it('アクティビティ未設定の行はレンズ中に入らない', () => {
    expect(applySegmentLens(rows, ['a1', 'a2'])).toHaveLength(2);
  });

  it('空のセグメントでは何も残らない', () => {
    expect(applySegmentLens(rows, [])).toEqual([]);
  });
});

describe('computeDenominators', () => {
  const all = [
    activity({ activityId: 'a1', categoryId: 'c1', recordedMinutes: 600 }),
    activity({ activityId: 'a2', categoryId: 'c2', recordedMinutes: 2400 }), // 睡眠相当
  ];

  it('余白 on では track に余白が入る', () => {
    const result = computeDenominators({
      allActivities: all,
      visibleActivities: all,
      lengthMinutes: 10080,
      marginVisible: true,
    });

    expect(result.totalAllMinutes).toBe(3000);
    expect(result.marginMinutes).toBe(7080);
    expect(result.visibleMinutes).toBe(3000);
    expect(result.trackMinutes).toBe(10080);
  });

  it('余白 off では track がインクの合計になる', () => {
    const result = computeDenominators({
      allActivities: all,
      visibleActivities: all,
      lengthMinutes: 10080,
      marginVisible: false,
    });

    expect(result.trackMinutes).toBe(3000);
    expect(result.marginMinutes).toBe(7080);
  });

  it('カテゴリを隠すと V と track から抜けるが、余白の値は変わらない', () => {
    const visible = all.filter((row) => row.activityId !== 'a2');

    const result = computeDenominators({
      allActivities: all,
      visibleActivities: visible,
      lengthMinutes: 10080,
      marginVisible: true,
    });

    expect(result.visibleMinutes).toBe(600);
    expect(result.trackMinutes).toBe(600 + 7080);
    // 余白はフィルタに依存しない（仕様 §13-2）
    expect(result.marginMinutes).toBe(7080);
    expect(result.totalAllMinutes).toBe(3000);
  });

  it('データが無くても track は 1 以上（0 除算防止）', () => {
    const result = computeDenominators({
      allActivities: [],
      visibleActivities: [],
      lengthMinutes: 10080,
      marginVisible: false,
    });

    expect(result.trackMinutes).toBe(1);
    expect(result.visibleMinutes).toBe(0);
  });

  it('記録が分母を超えても余白は負のまま track へ足さない', () => {
    // 重なりのある記録などで totalAll が L を超えうる
    const over = [activity({ recordedMinutes: 20000 })];

    const result = computeDenominators({
      allActivities: over,
      visibleActivities: over,
      lengthMinutes: 10080,
      marginVisible: true,
    });

    expect(result.marginMinutes).toBe(-9920);
    expect(result.trackMinutes).toBe(20000);
  });
});

describe('toPercent', () => {
  it('track で割って丸める', () => {
    expect(toPercent(3000, 10080)).toBe(30);
    expect(toPercent(0, 10080)).toBe(0);
  });

  it('track が 0 でも壊れない', () => {
    expect(toPercent(10, 0)).toBe(1000);
  });
});

describe('buildAllocationSlices', () => {
  const rows = [
    activity({ activityId: 'a1', categoryId: 'c1', categoryName: '仕事', recordedMinutes: 600 }),
    activity({ activityId: 'a2', categoryId: 'c1', categoryName: '仕事', recordedMinutes: 300 }),
    activity({
      activityId: 'a3',
      categoryId: null,
      categoryName: null,
      categoryColor: null,
      recordedMinutes: 120,
    }),
    activity({ activityId: 'a4', categoryId: 'c2', categoryName: '生活', recordedMinutes: 0 }),
  ];

  it('カテゴリー別にまとめ、記録の多い順に並べる', () => {
    const slices = buildAllocationSlices(rows, 10080, 'category');

    expect(slices.map((slice) => slice.key)).toEqual(['c1', UNCATEGORIZED_KEY]);
    expect(slices[0]?.minutes).toBe(900);
    expect(slices[0]?.label).toBe('仕事');
    expect(slices[1]?.minutes).toBe(120);
  });

  it('記録 0 のカテゴリは行を持たない', () => {
    expect(buildAllocationSlices(rows, 10080, 'category').some((s) => s.key === 'c2')).toBe(false);
  });

  it('余白のセグメントを作らない', () => {
    const slices = buildAllocationSlices(rows, 10080, 'category');
    const total = slices.reduce((sum, slice) => sum + slice.minutes, 0);

    // 塗るのはインクだけ。残りは背景トラック（紙）として残る
    expect(total).toBe(1020);
    expect(slices.some((slice) => slice.key === '__margin')).toBe(false);
  });

  it('レンズ中はアクティビティ別に割る', () => {
    const slices = buildAllocationSlices(rows, 1020, 'activity');

    expect(slices.map((slice) => slice.key)).toEqual(['a1', 'a2', 'a3']);
    expect(slices[0]?.label).toBe('執筆');
  });

  it('インクが無ければ空', () => {
    expect(buildAllocationSlices([], 1, 'category')).toEqual([]);
  });
});

describe('computeUncategorizedPercent', () => {
  it('見えているインクに対する割合を返す', () => {
    const rows = [
      activity({ activityId: 'a1', categoryId: 'c1', recordedMinutes: 800 }),
      activity({ activityId: 'a2', categoryId: null, recordedMinutes: 200 }),
    ];

    expect(computeUncategorizedPercent(rows, 1000)).toBe(20);
  });

  it('インクが無ければ 0%', () => {
    expect(computeUncategorizedPercent([], 0)).toBe(0);
  });
});

describe('computePreviousDelta', () => {
  it('同じフィルタで比較した差を返す', () => {
    const delta = computePreviousDelta({
      visibleMinutes: 600,
      previousActivities: [
        { activityId: 'a1', recordedMinutes: 400 },
        { activityId: 'a2', recordedMinutes: 100 },
      ],
      visibleActivityIds: new Set(['a1', 'a2']),
    });

    expect(delta).toBe(100);
  });

  it('見えていないアクティビティは前期間側でも数えない', () => {
    const delta = computePreviousDelta({
      visibleMinutes: 600,
      previousActivities: [
        { activityId: 'a1', recordedMinutes: 400 },
        { activityId: 'a2', recordedMinutes: 100 },
      ],
      visibleActivityIds: new Set(['a1']),
    });

    expect(delta).toBe(200);
  });

  it('前期間にインクが無ければ null（数字を作らない）', () => {
    expect(
      computePreviousDelta({
        visibleMinutes: 600,
        previousActivities: [],
        visibleActivityIds: new Set(['a1']),
      }),
    ).toBeNull();
  });

  it('前期間の合計が 1 分未満なら null', () => {
    expect(
      computePreviousDelta({
        visibleMinutes: 600,
        previousActivities: [{ activityId: 'a1', recordedMinutes: 0.5 }],
        visibleActivityIds: new Set(['a1']),
      }),
    ).toBeNull();
  });
});

describe('buildSegmentBars', () => {
  const rows = [
    activity({ activityId: 'a1', recordedMinutes: 600 }),
    activity({ activityId: 'a2', recordedMinutes: 300 }),
    activity({ activityId: 'a3', recordedMinutes: 120 }),
  ];

  it('メンバーの合計を返す', () => {
    const bars = buildSegmentBars(
      rows,
      [{ id: 's1', name: '深い仕事', activityIds: ['a1', 'a2'] }],
      10080,
    );

    expect(bars[0]?.minutes).toBe(900);
    expect(bars[0]?.percent).toBe(9);
  });

  it('セグメント同士が重なってよい（合計しない）', () => {
    const bars = buildSegmentBars(
      rows,
      [
        { id: 's1', name: 'A', activityIds: ['a1', 'a2'] },
        { id: 's2', name: 'B', activityIds: ['a2', 'a3'] },
      ],
      10080,
    );

    expect(bars[0]?.minutes).toBe(900);
    expect(bars[1]?.minutes).toBe(420);
  });

  it('メンバー 0 件のセグメントも行を残す', () => {
    const bars = buildSegmentBars(rows, [{ id: 's1', name: '空', activityIds: [] }], 10080);

    expect(bars).toHaveLength(1);
    expect(bars[0]?.minutes).toBe(0);
  });

  it('100% で頭打ちにする', () => {
    const bars = buildSegmentBars(rows, [{ id: 's1', name: '全部', activityIds: ['a1'] }], 100);

    expect(bars[0]?.percent).toBe(100);
  });
});

describe('buildInkColumns', () => {
  const keys = ['2026-08-31', '2026-09-01', '2026-09-02'];
  const rows = [
    activity({
      activityId: 'a1',
      categoryId: 'c1',
      categoryName: '仕事',
      byBucket: [60, 120, 0],
    }),
    activity({
      activityId: 'a2',
      categoryId: 'c2',
      categoryName: '生活',
      byBucket: [30, 0, 0],
    }),
  ];

  it('列ごとにカテゴリーを積み上げる', () => {
    const columns = buildInkColumns(rows, keys);

    expect(columns).toHaveLength(3);
    expect(columns[0]?.totalMinutes).toBe(90);
    expect(columns[0]?.stacks.map((stack) => stack.key)).toEqual(['c1', 'c2']);
    expect(columns[1]?.totalMinutes).toBe(120);
    expect(columns[2]?.stacks).toEqual([]);
  });

  it('未分類は擬似カテゴリのキーになる', () => {
    const columns = buildInkColumns(
      [activity({ categoryId: null, categoryName: null, byBucket: [45, 0, 0] })],
      keys,
    );

    expect(columns[0]?.stacks[0]?.key).toBe(UNCATEGORIZED_KEY);
  });

  it('全列 0 でもスケールが 1 以上', () => {
    expect(maxInkColumnMinutes(buildInkColumns([], keys))).toBe(1);
  });

  it('最大列の分数を返す', () => {
    expect(maxInkColumnMinutes(buildInkColumns(rows, keys))).toBe(120);
  });
});

describe('buildExecutionRows', () => {
  it('記録か予定があれば行になり、rec 降順で並ぶ', () => {
    const rows = buildExecutionRows([
      activity({ activityId: 'a1', recordedMinutes: 100 }),
      activity({ activityId: 'a2', recordedMinutes: 300 }),
      activity({ activityId: 'a3', recordedMinutes: 0, plannedMinutes: 60 }),
      activity({ activityId: 'a4', recordedMinutes: 0, plannedMinutes: 0 }),
    ]);

    expect(rows.map((row) => row.activityId)).toEqual(['a2', 'a1', 'a3']);
  });

  it('件数上限で切らない（決算の完全性）', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      activity({ activityId: `a${index}`, recordedMinutes: index + 1 }),
    );

    expect(buildExecutionRows(many)).toHaveLength(40);
  });

  it('バー幅を行の最大値で正規化する', () => {
    const rows = buildExecutionRows([
      activity({ activityId: 'a1', recordedMinutes: 300, plannedMinutes: 600 }),
      activity({ activityId: 'a2', recordedMinutes: 150 }),
    ]);

    // 最大は a1 の予定 600
    expect(rows[0]?.recordedRatio).toBeCloseTo(0.5);
    expect(rows[0]?.plannedRatio).toBeCloseTo(1);
    expect(rows[1]?.recordedRatio).toBeCloseTo(0.25);
  });

  it('予定が無い行は予定バーを描かない', () => {
    const rows = buildExecutionRows([activity({ recordedMinutes: 100 })]);

    expect(rows[0]?.plannedRatio).toBeNull();
  });

  it('過去予定が 15 分未満なら予定比を作らない', () => {
    const rows = buildExecutionRows([
      activity({
        activityId: 'a1',
        recordedMinutes: 100,
        plannedMinutes: 600,
        plannedPastMinutes: 14,
      }),
    ]);

    expect(rows[0]?.planRatioPercent).toBeNull();
  });

  it('過去予定がちょうど 15 分なら予定比を出す', () => {
    const rows = buildExecutionRows([
      activity({ activityId: 'a1', recordedMinutes: 30, plannedPastMinutes: 15 }),
    ]);

    expect(rows[0]?.planRatioPercent).toBe(200);
  });

  it('未来の予定は予定比に影響しない', () => {
    const rows = buildExecutionRows([
      activity({
        activityId: 'a1',
        recordedMinutes: 60,
        plannedMinutes: 600, // 未来の予定を含む合計
        plannedPastMinutes: 60,
      }),
    ]);

    expect(rows[0]?.planRatioPercent).toBe(100);
  });

  it('行が無ければ空', () => {
    expect(buildExecutionRows([])).toEqual([]);
  });
});

describe('buildMirrorRows', () => {
  const candidate = (overrides: Partial<ReportActivityAggregate>) =>
    activity({
      recordedMinutes: 120,
      plannedPastMinutes: 60,
      plannedPastBoxes: 3,
      ...overrides,
    });

  it('候補条件を満たす行だけを返す', () => {
    const rows = buildMirrorRows([
      candidate({ activityId: 'ok' }),
      candidate({ activityId: 'few-boxes', plannedPastBoxes: 2 }),
      candidate({ activityId: 'short-plan', plannedPastMinutes: 29 }),
      candidate({ activityId: 'no-record', recordedMinutes: 0 }),
    ]);

    expect(rows.map((row) => row.activityId)).toEqual(['ok']);
  });

  it('箱数がちょうど 3、過去予定がちょうど 30 分なら候補になる', () => {
    const rows = buildMirrorRows([
      candidate({ activityId: 'edge', plannedPastBoxes: 3, plannedPastMinutes: 30 }),
    ]);

    expect(rows).toHaveLength(1);
  });

  it('癖の強い順（|coef − 1| 降順）に並べ、最大 3 件', () => {
    const rows = buildMirrorRows([
      candidate({ activityId: 'a', recordedMinutes: 66, plannedPastMinutes: 60 }), // 1.10
      candidate({ activityId: 'b', recordedMinutes: 120, plannedPastMinutes: 60 }), // 2.00
      candidate({ activityId: 'c', recordedMinutes: 30, plannedPastMinutes: 60 }), // 0.50
      candidate({ activityId: 'd', recordedMinutes: 90, plannedPastMinutes: 60 }), // 1.50
    ]);

    expect(rows.map((row) => row.activityId)).toEqual(['b', 'c', 'd']);
    expect(rows).toHaveLength(3);
  });

  it('係数から文言のトーンを決める', () => {
    const rows = buildMirrorRows([
      candidate({ activityId: 'over', recordedMinutes: 68, plannedPastMinutes: 60 }), // 1.133
      candidate({ activityId: 'under', recordedMinutes: 51, plannedPastMinutes: 60 }), // 0.85
      candidate({ activityId: 'on-plan', recordedMinutes: 60, plannedPastMinutes: 60 }), // 1.00
    ]);

    const toneOf = (id: string) => rows.find((row) => row.activityId === id)?.tone;
    expect(toneOf('over')).toBe('over');
    expect(toneOf('under')).toBe('under');
    expect(toneOf('on-plan')).toBe('onPlan');
  });

  it('候補が無ければ空（合成値を作らない）', () => {
    expect(buildMirrorRows([activity({ recordedMinutes: 100 })])).toEqual([]);
  });
});

describe('buildCompassPoints', () => {
  const answered = (overrides: Partial<ReportActivityAggregate>) =>
    activity({
      recordedMinutes: 300,
      fulfillment: { low: 0, medium: 0, high: 5 },
      ...overrides,
    });

  it('回答が 5 件以上の行だけが点になる', () => {
    const points = buildCompassPoints([
      answered({ activityId: 'ok' }),
      answered({ activityId: 'few', fulfillment: { low: 1, medium: 1, high: 2 } }),
      answered({ activityId: 'no-record', recordedMinutes: 0 }),
    ]);

    expect(points.map((point) => point.activityId)).toEqual(['ok']);
  });

  it('x は投下時間に比例し、最大の行が右端に来る', () => {
    const points = buildCompassPoints([
      answered({ activityId: 'big', recordedMinutes: 600 }),
      answered({ activityId: 'small', recordedMinutes: 300 }),
    ]);

    const big = points.find((point) => point.activityId === 'big');
    const small = points.find((point) => point.activityId === 'small');
    expect(big?.x).toBeCloseTo(92); // 6 + 1 * 86
    expect(small?.x).toBeCloseTo(49); // 6 + 0.5 * 86
  });

  it('y は充実と消耗の差で決まる', () => {
    const points = buildCompassPoints([
      answered({ activityId: 'all-high', fulfillment: { low: 0, medium: 0, high: 5 } }),
      answered({ activityId: 'all-low', fulfillment: { low: 5, medium: 0, high: 0 } }),
      answered({ activityId: 'neutral', fulfillment: { low: 0, medium: 5, high: 0 } }),
    ]);

    const yOf = (id: string) => points.find((point) => point.activityId === id)?.y;
    expect(yOf('all-high')).toBeCloseTo(86); // slope 1
    expect(yOf('all-low')).toBeCloseTo(14); // slope -1
    expect(yOf('neutral')).toBeCloseTo(50); // slope 0
  });

  /** 読み上げラベルが投下時間を語るので、点は記録時間を持ったまま出す。 */
  it('点が投下時間を持ち帰る', () => {
    const points = buildCompassPoints([answered({ activityId: 'ok', recordedMinutes: 420 })]);

    expect(points[0]?.recordedMinutes).toBe(420);
  });

  it('濃度が回答数に比例し、5 件で頭打ちになる', () => {
    const points = buildCompassPoints([
      answered({ activityId: 'five', fulfillment: { low: 0, medium: 0, high: 5 } }),
      answered({ activityId: 'ten', fulfillment: { low: 0, medium: 0, high: 10 } }),
      answered({ activityId: 'six', fulfillment: { low: 1, medium: 0, high: 5 } }),
    ]);

    const opacityOf = (id: string) => points.find((point) => point.activityId === id)?.opacity;
    expect(opacityOf('five')).toBeCloseTo(1);
    expect(opacityOf('ten')).toBeCloseTo(1);
    expect(opacityOf('six')).toBeCloseTo(1);
  });

  it('回答が 1 件も無ければ点が生まれず、エラーにもならない', () => {
    expect(buildCompassPoints([activity({ recordedMinutes: 600 })])).toEqual([]);
    expect(buildCompassPoints([])).toEqual([]);
  });
});

describe('buildCompassWaitingList', () => {
  it('記録があって回答が 5 件未満の行を、記録の多い順に並べる', () => {
    const waiting = buildCompassWaitingList([
      activity({ activityId: 'a1', activityName: 'A', recordedMinutes: 100 }),
      activity({ activityId: 'a2', activityName: 'B', recordedMinutes: 300 }),
      activity({
        activityId: 'a3',
        activityName: 'C',
        recordedMinutes: 200,
        fulfillment: { low: 0, medium: 0, high: 5 },
      }),
      activity({ activityId: 'a4', activityName: 'D', recordedMinutes: 0 }),
    ]);

    expect(waiting.map((row) => row.name)).toEqual(['B', 'A']);
  });

  it('回答がちょうど 4 件なら待機、5 件なら卒業', () => {
    const rows = [
      activity({
        activityId: 'four',
        recordedMinutes: 100,
        fulfillment: { low: 1, medium: 2, high: 1 },
      }),
      activity({
        activityId: 'five',
        recordedMinutes: 100,
        fulfillment: { low: 1, medium: 2, high: 2 },
      }),
    ];

    expect(buildCompassWaitingList(rows).map((row) => row.activityId)).toEqual(['four']);
    expect(buildCompassPoints(rows).map((point) => point.activityId)).toEqual(['five']);
  });
});

describe('answerCountOf', () => {
  it('3 値の和を返す', () => {
    expect(answerCountOf(activity({ fulfillment: { low: 1, medium: 2, high: 3 } }))).toBe(6);
    expect(answerCountOf(activity())).toBe(0);
  });
});
