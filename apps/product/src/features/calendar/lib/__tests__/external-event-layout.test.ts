import { describe, expect, it } from 'vitest';

import { calculateExternalEventLayout, toZonedExternalEvents } from '../external-event-layout';

const HOUR_HEIGHT = 60;
const LANE_WIDTH = 38;
const DAY_START = new Date(2026, 7, 11, 0, 0, 0);

function at(hour: number, minute = 0, dayOffset = 0): Date {
  return new Date(2026, 7, 11 + dayOffset, hour, minute, 0);
}

function layout(events: Array<{ id: string; startDate: Date; endDate: Date }>) {
  return calculateExternalEventLayout(events, {
    dayStart: DAY_START,
    hourHeight: HOUR_HEIGHT,
    laneWidthPercent: LANE_WIDTH,
  });
}

describe('calculateExternalEventLayout / 基本の座標', () => {
  it('対象日の時刻から top / height を出す', () => {
    const positions = layout([{ id: 'a', startDate: at(9), endDate: at(10, 30) }]);

    expect(positions.a).toEqual({
      top: 9 * HOUR_HEIGHT,
      height: 1.5 * HOUR_HEIGHT,
      left: 0,
      width: LANE_WIDTH,
    });
  });

  it('重ならなければ全幅（レーン幅）を使う', () => {
    const positions = layout([
      { id: 'a', startDate: at(9), endDate: at(10) },
      { id: 'b', startDate: at(11), endDate: at(12) },
    ]);

    expect(positions.a?.width).toBe(LANE_WIDTH);
    expect(positions.b?.width).toBe(LANE_WIDTH);
    expect(positions.b?.left).toBe(0);
  });

  it('隣接（前の終わり = 次の始まり）は重なり扱いしない', () => {
    const positions = layout([
      { id: 'a', startDate: at(9), endDate: at(10) },
      { id: 'b', startDate: at(10), endDate: at(11) },
    ]);

    expect(positions.a?.width).toBe(LANE_WIDTH);
    expect(positions.b?.width).toBe(LANE_WIDTH);
  });
});

describe('calculateExternalEventLayout / 重なり', () => {
  it('2 件重なるとレーンを等分する', () => {
    const positions = layout([
      { id: 'a', startDate: at(9), endDate: at(11) },
      { id: 'b', startDate: at(10), endDate: at(12) },
    ]);

    expect(positions.a).toMatchObject({ left: 0, width: LANE_WIDTH / 2 });
    expect(positions.b).toMatchObject({ left: LANE_WIDTH / 2, width: LANE_WIDTH / 2 });
  });

  it('3 件重なると 3 分割する', () => {
    const positions = layout([
      { id: 'a', startDate: at(9), endDate: at(12) },
      { id: 'b', startDate: at(9, 30), endDate: at(12) },
      { id: 'c', startDate: at(10), endDate: at(12) },
    ]);

    expect(positions.a?.width).toBeCloseTo(LANE_WIDTH / 3);
    expect(positions.b?.left).toBeCloseTo(LANE_WIDTH / 3);
    expect(positions.c?.left).toBeCloseTo((LANE_WIDTH / 3) * 2);
  });

  it('重なりが解けた後は再び全幅に戻る', () => {
    const positions = layout([
      { id: 'a', startDate: at(9), endDate: at(10) },
      { id: 'b', startDate: at(9, 30), endDate: at(10) },
      { id: 'c', startDate: at(14), endDate: at(15) },
    ]);

    expect(positions.a?.width).toBe(LANE_WIDTH / 2);
    expect(positions.c?.width).toBe(LANE_WIDTH);
  });

  it('空いたカラムを再利用する（連鎖する重なりで無限に細くしない）', () => {
    const positions = layout([
      { id: 'a', startDate: at(9), endDate: at(12) },
      { id: 'b', startDate: at(9, 30), endDate: at(10) },
      { id: 'c', startDate: at(10, 30), endDate: at(11) },
    ]);

    expect(positions.b?.left).toBe(LANE_WIDTH / 2);
    // c は b が空けたカラムに入るので 2 分割のまま
    expect(positions.c?.left).toBe(LANE_WIDTH / 2);
    expect(positions.a?.width).toBe(LANE_WIDTH / 2);
  });
});

describe('calculateExternalEventLayout / 日跨ぎのクリップ', () => {
  it('前日から続く予定は top=0 から描く', () => {
    const positions = layout([{ id: 'a', startDate: at(22, 0, -1), endDate: at(2) }]);

    expect(positions.a).toMatchObject({ top: 0, height: 2 * HOUR_HEIGHT });
  });

  it('翌日へ続く予定は 24:00 でクランプする', () => {
    const positions = layout([{ id: 'a', startDate: at(23), endDate: at(1, 0, 1) }]);

    expect(positions.a).toMatchObject({ top: 23 * HOUR_HEIGHT, height: 1 * HOUR_HEIGHT });
  });

  it('対象日を丸ごと覆う 24h 超の予定は 0-24 時で埋める', () => {
    const positions = layout([{ id: 'a', startDate: at(10, 0, -1), endDate: at(10, 0, 1) }]);

    expect(positions.a).toMatchObject({ top: 0, height: 24 * HOUR_HEIGHT });
  });

  it('対象日に重ならない予定は座標を持たない', () => {
    const positions = layout([
      { id: 'past', startDate: at(1, 0, -1), endDate: at(2, 0, -1) },
      { id: 'future', startDate: at(1, 0, 1), endDate: at(2, 0, 1) },
    ]);

    expect(positions).toEqual({});
  });

  it('対象日の 00:00 ちょうどに終わる予定は描かない', () => {
    const positions = layout([{ id: 'a', startDate: at(22, 0, -1), endDate: at(0) }]);

    expect(positions.a).toBeUndefined();
  });
});

describe('calculateExternalEventLayout / レーン幅', () => {
  it('レーン幅 100（モバイルの予定表示）では全幅を使う', () => {
    const positions = calculateExternalEventLayout(
      [{ id: 'a', startDate: at(9), endDate: at(10) }],
      {
        dayStart: DAY_START,
        hourHeight: HOUR_HEIGHT,
        laneWidthPercent: 100,
      },
    );

    expect(positions.a).toMatchObject({ left: 0, width: 100 });
  });

  it('レーン幅 0（モバイルの記録表示）では何も描かない', () => {
    const positions = calculateExternalEventLayout(
      [{ id: 'a', startDate: at(9), endDate: at(10) }],
      {
        dayStart: DAY_START,
        hourHeight: HOUR_HEIGHT,
        laneWidthPercent: 0,
      },
    );

    expect(positions).toEqual({});
  });
});

describe('toZonedExternalEvents', () => {
  it('ユーザー TZ の壁時計をローカルフィールドへ移す', () => {
    // UTC 00:00 は Asia/Tokyo の 09:00。grid は getHours() 基準で座標を出すため、
    // 変換後の Date のローカル時刻が 9 時になっていないと plan / record とずれる。
    const [zoned] = toZonedExternalEvents(
      [
        {
          id: 'a',
          startDate: new Date('2026-08-11T00:00:00.000Z'),
          endDate: new Date('2026-08-11T01:00:00.000Z'),
        },
      ],
      'Asia/Tokyo',
    );

    expect(zoned?.startDate.getHours()).toBe(9);
    expect(zoned?.endDate.getHours()).toBe(10);
  });

  it('変換した日時を layout に通すと壁時計どおりの座標になる', () => {
    const zoned = toZonedExternalEvents(
      [
        {
          id: 'a',
          startDate: new Date('2026-08-11T00:00:00.000Z'),
          endDate: new Date('2026-08-11T01:00:00.000Z'),
        },
      ],
      'Asia/Tokyo',
    );

    const positions = calculateExternalEventLayout(zoned, {
      dayStart: DAY_START,
      hourHeight: HOUR_HEIGHT,
      laneWidthPercent: LANE_WIDTH,
    });

    expect(positions.a).toMatchObject({ top: 9 * HOUR_HEIGHT, height: HOUR_HEIGHT });
  });

  it('id 以外のフィールドを保持する', () => {
    const [zoned] = toZonedExternalEvents(
      [
        {
          id: 'a',
          title: 'Standup',
          startDate: new Date('2026-08-11T00:00:00.000Z'),
          endDate: new Date('2026-08-11T01:00:00.000Z'),
        },
      ],
      'Asia/Tokyo',
    );

    expect(zoned?.title).toBe('Standup');
  });
});
