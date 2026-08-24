import { describe, expect, it } from 'vitest';

import { createClipboardTimeblock } from '../timeblock-clipboard';

describe('createClipboardTimeblock', () => {
  it('種別と表示内容だけをコピー用データへ変換する', () => {
    const result = createClipboardTimeblock({
      kind: 'record',
      title: '読書',
      description: '第3章まで',
      startAt: new Date(2026, 6, 14, 9, 15),
      endAt: new Date(2026, 6, 14, 10, 45),
    });

    expect(result).toEqual({
      kind: 'record',
      title: '読書',
      description: '第3章まで',
      duration: 90,
      startHour: 9,
      startMinute: 15,
    });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('planId');
  });
});
