import { describe, expect, it } from 'vitest';

import type { TagDashboardEntryRow, TagDashboardTagRow } from '../tag-dashboard';
import { buildTagDashboard } from '../tag-dashboard';

const TAG: TagDashboardTagRow = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Work',
  color: 'blue',
  icon: 'briefcase',
};

function entry(overrides: Partial<TagDashboardEntryRow>): TagDashboardEntryRow {
  return {
    id: 'entry-1',
    title: 'Entry',
    description: null,
    start_time: '2026-05-01T00:00:00.000Z',
    end_time: '2026-05-01T01:00:00.000Z',
    actual_start_time: '2026-05-01T00:00:00.000Z',
    actual_end_time: '2026-05-01T01:00:00.000Z',
    tag_id: TAG.id,
    ...overrides,
  };
}

describe('buildTagDashboard', () => {
  it('planned と actual を別々に集計する', () => {
    const result = buildTagDashboard({
      tag: TAG,
      rows: [entry({})],
      limit: 50,
      timezone: 'UTC',
    });

    expect(result.summary).toMatchObject({
      totalMinutes: 60,
      plannedMinutes: 60,
      actualMinutes: 60,
      diffMinutes: 0,
      entryCount: 1,
    });
    expect(result.dailyRows).toEqual([
      { date: '2026-05-01', plannedMinutes: 60, actualMinutes: 60, diffMinutes: 0 },
    ]);
  });

  it('実績ありの場合は actual_start_time / actual_end_time で集計する', () => {
    const result = buildTagDashboard({
      tag: TAG,
      rows: [
        entry({
          actual_start_time: '2026-05-01T00:10:00.000Z',
          actual_end_time: '2026-05-01T01:40:00.000Z',
        }),
      ],
      limit: 50,
      timezone: 'UTC',
    });

    expect(result.summary.plannedMinutes).toBe(60);
    expect(result.summary.actualMinutes).toBe(90);
    expect(result.summary.diffMinutes).toBe(30);
  });

  it('実績の片側だけ未入力なら actual は 0 分として扱う', () => {
    const result = buildTagDashboard({
      tag: TAG,
      rows: [
        entry({
          actual_start_time: '2026-05-01T00:15:00.000Z',
          actual_end_time: null,
        }),
      ],
      limit: 50,
      timezone: 'UTC',
    });

    expect(result.summary.plannedMinutes).toBe(60);
    expect(result.summary.actualMinutes).toBe(0);
    expect(result.summary.diffMinutes).toBe(-60);
  });

  it('unplanned は予定0分 / 実績ありとして扱う', () => {
    const result = buildTagDashboard({
      tag: TAG,
      rows: [
        entry({
          start_time: null,
          end_time: null,
          actual_start_time: '2026-05-01T00:15:00.000Z',
          actual_end_time: '2026-05-01T01:00:00.000Z',
        }),
      ],
      limit: 50,
      timezone: 'UTC',
    });

    expect(result.summary.plannedMinutes).toBe(0);
    expect(result.summary.actualMinutes).toBe(45);
    expect(result.summary.diffMinutes).toBe(45);
  });

  it('渡された期間内行だけを日別に集計する', () => {
    const rows = [
      entry({
        id: 'in-1',
        start_time: '2026-05-01T00:00:00.000Z',
        end_time: '2026-05-01T01:00:00.000Z',
      }),
      entry({
        id: 'in-2',
        start_time: '2026-05-02T00:00:00.000Z',
        end_time: '2026-05-02T02:00:00.000Z',
        actual_start_time: '2026-05-02T00:00:00.000Z',
        actual_end_time: '2026-05-02T02:00:00.000Z',
      }),
    ];

    const result = buildTagDashboard({ tag: TAG, rows, limit: 50, timezone: 'UTC' });

    expect(result.dailyRows).toEqual([
      { date: '2026-05-01', plannedMinutes: 60, actualMinutes: 60, diffMinutes: 0 },
      { date: '2026-05-02', plannedMinutes: 120, actualMinutes: 120, diffMinutes: 0 },
    ]);
  });

  it('entries は新しい順に並び limit で制限される', () => {
    const result = buildTagDashboard({
      tag: TAG,
      rows: [
        entry({ id: 'old', start_time: '2026-05-01T00:00:00.000Z' }),
        entry({
          id: 'new',
          start_time: '2026-05-03T00:00:00.000Z',
          end_time: '2026-05-03T01:00:00.000Z',
          actual_start_time: '2026-05-03T00:00:00.000Z',
          actual_end_time: '2026-05-03T01:00:00.000Z',
        }),
        entry({
          id: 'mid',
          start_time: '2026-05-02T00:00:00.000Z',
          end_time: '2026-05-02T01:00:00.000Z',
          actual_start_time: '2026-05-02T00:00:00.000Z',
          actual_end_time: '2026-05-02T01:00:00.000Z',
        }),
      ],
      limit: 2,
      timezone: 'UTC',
    });

    expect(result.entries.map((row) => row.entryId)).toEqual(['new', 'mid']);
  });
});
