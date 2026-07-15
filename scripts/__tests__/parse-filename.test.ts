import { describe, expect, it } from 'vitest';

import { EAGLE_FEATURE_TAGS, parseScreenshotFilename } from '../parse-filename.js';

describe('parseScreenshotFilename', () => {
  it('現行 feature taxonomy のタグを付与する', () => {
    const parsed = parseScreenshotFilename('Features_Timeblock_Card--WithRecord_light_mobile.png');

    expect(parsed.tags).toContain('timeblock');
    expect(EAGLE_FEATURE_TAGS).toEqual([
      'auth',
      'calendar',
      'contact',
      'review',
      'settings',
      'tags',
      'timeblock',
    ]);
  });

  it('廃止済み feature を管理 taxonomy に含めない', () => {
    expect(EAGLE_FEATURE_TAGS).not.toEqual(
      expect.arrayContaining(['stats', 'entry', 'chronotype']),
    );
  });
});
