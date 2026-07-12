import { describe, expect, it } from 'vitest';

import { transformTimeByTagResponse } from '../statistics-time-by-tag-transform';

describe('transformTimeByTagResponse', () => {
  it('null 入力 → 空配列', () => {
    expect(transformTimeByTagResponse(null)).toEqual([]);
  });

  it('undefined 入力 → 空配列', () => {
    expect(transformTimeByTagResponse(undefined)).toEqual([]);
  });

  it('空配列 → 空配列', () => {
    expect(transformTimeByTagResponse([])).toEqual([]);
  });

  it('単一 row: 4 field の rename (tag_name → name, tag_color → color)', () => {
    const result = transformTimeByTagResponse([
      { tag_id: 'tag-1', tag_name: 'Deep Work', tag_color: 'blue', hours: 12.5 },
    ]);
    expect(result).toEqual([{ tagId: 'tag-1', name: 'Deep Work', color: 'blue', hours: 12.5 }]);
  });

  it('複数 row: 順序保持', () => {
    const result = transformTimeByTagResponse([
      { tag_id: 'tag-a', tag_name: 'A', tag_color: 'red', hours: 1 },
      { tag_id: 'tag-b', tag_name: 'B', tag_color: 'green', hours: 2 },
      { tag_id: 'tag-c', tag_name: 'C', tag_color: 'blue', hours: 3 },
    ]);
    expect(result.map((r) => r.tagId)).toEqual(['tag-a', 'tag-b', 'tag-c']);
  });

  it('hours = 0 → そのまま 0', () => {
    const result = transformTimeByTagResponse([
      { tag_id: 'tag-1', tag_name: 'X', tag_color: 'gray', hours: 0 },
    ]);
    expect(result[0]?.hours).toBe(0);
  });

  it('hours decimal: 精度保持', () => {
    const result = transformTimeByTagResponse([
      { tag_id: 'tag-1', tag_name: 'X', tag_color: 'gray', hours: 1.234567 },
    ]);
    expect(result[0]?.hours).toBe(1.234567);
  });

  it('空文字 tag_color → そのまま空文字 (fallback なし、estimation-accuracy と異なる)', () => {
    const result = transformTimeByTagResponse([
      { tag_id: 'tag-1', tag_name: 'X', tag_color: '', hours: 5 },
    ]);
    expect(result[0]?.color).toBe('');
  });

  it('output shape に snake_case key は含まれない', () => {
    const result = transformTimeByTagResponse([
      { tag_id: 'tag-1', tag_name: 'X', tag_color: 'blue', hours: 1 },
    ]);
    const item = result[0]!;
    expect('tag_id' in item).toBe(false);
    expect('tag_name' in item).toBe(false);
    expect('tag_color' in item).toBe(false);
  });
});
