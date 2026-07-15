import { describe, expect, it } from 'vitest';

import { buildClipboardTimeblock } from '../clipboard-timeblock';

describe('buildClipboardTimeblock', () => {
  it('ユーザーのタイムゾーンで開始時刻をコピーする', () => {
    expect(
      buildClipboardTimeblock(
        {
          title: 'Deep work',
          note: 'Draft',
          tagId: 'tag-1',
          startAt: '2026-07-15T05:30:00.000Z',
          endAt: '2026-07-15T07:00:00.000Z',
        },
        'Asia/Tokyo',
      ),
    ).toEqual({
      title: 'Deep work',
      description: 'Draft',
      tagId: 'tag-1',
      duration: 90,
      startHour: 14,
      startMinute: 30,
    });
  });

  it('IDやPlan/Record関連を含めず、表示内容だけを返す', () => {
    const clipboard = buildClipboardTimeblock(
      {
        title: '',
        note: null,
        tagId: null,
        startAt: new Date('2026-07-15T23:45:00.000Z'),
        endAt: new Date('2026-07-16T00:15:00.000Z'),
      },
      'America/New_York',
    );

    expect(clipboard).toEqual({
      title: '',
      description: null,
      tagId: null,
      duration: 30,
      startHour: 19,
      startMinute: 45,
    });
    expect(clipboard).not.toHaveProperty('id');
    expect(clipboard).not.toHaveProperty('planId');
  });

  it('壊れた日時を拒否する', () => {
    expect(() =>
      buildClipboardTimeblock(
        {
          title: 'Invalid',
          note: null,
          tagId: null,
          startAt: 'invalid',
          endAt: '2026-07-15T00:00:00.000Z',
        },
        'UTC',
      ),
    ).toThrow('Invalid timeblock datetime');
  });
});
