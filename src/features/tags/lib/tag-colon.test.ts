import { describe, expect, it } from 'vitest';

import type { Tag } from '../types';

import {
  buildColonTagName,
  getTagDisplayLabel,
  groupTagsByPrefix,
  parseColonTag,
} from './tag-colon';

/** テスト用のタグファクトリ */
function makeTag(overrides: Partial<Tag> & { name: string }): Tag {
  return {
    id: `tag-${overrides.name}`,
    user_id: 'user-1',
    color: 'blue',
    icon: null,
    is_active: true,
    sort_order: 0,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('parseColonTag', () => {
  it('コロンなし → suffix null', () => {
    expect(parseColonTag('運動')).toEqual({ prefix: '運動', suffix: null });
  });

  it('コロン1つ → prefix:suffix に分割', () => {
    expect(parseColonTag('開発:api')).toEqual({ prefix: '開発', suffix: 'api' });
  });

  it('コロン複数 → 最初のコロンで分割', () => {
    expect(parseColonTag('a:b:c')).toEqual({ prefix: 'a', suffix: 'b:c' });
  });

  it('空文字', () => {
    expect(parseColonTag('')).toEqual({ prefix: '', suffix: null });
  });

  it('コロンで始まる', () => {
    expect(parseColonTag(':api')).toEqual({ prefix: '', suffix: 'api' });
  });

  it('コロンで終わる', () => {
    expect(parseColonTag('開発:')).toEqual({ prefix: '開発', suffix: '' });
  });
});

describe('groupTagsByPrefix', () => {
  it('コロン付きタグが2つ以上で同じprefix → グループ化', () => {
    const tags = [
      makeTag({ name: '開発:api' }),
      makeTag({ name: '開発:frontend' }),
      makeTag({ name: '運動' }),
    ];

    const result = groupTagsByPrefix(tags);

    expect(result.grouped.size).toBe(1);
    expect(result.grouped.get('開発')?.map((t) => t.name)).toEqual(['開発:api', '開発:frontend']);
    expect(result.ungrouped.map((t) => t.name)).toEqual(['運動']);
  });

  it('コロン付きだがprefixが1つだけ → ungroupedに移動', () => {
    const tags = [makeTag({ name: '開発:api' }), makeTag({ name: '運動' })];

    const result = groupTagsByPrefix(tags);

    expect(result.grouped.size).toBe(0);
    expect(result.ungrouped.map((t) => t.name)).toEqual(['運動', '開発:api']);
  });

  it('空配列', () => {
    const result = groupTagsByPrefix([]);
    expect(result.grouped.size).toBe(0);
    expect(result.ungrouped).toEqual([]);
  });

  it('全てコロンなし → 全てungrouped', () => {
    const tags = [makeTag({ name: '仕事' }), makeTag({ name: '運動' })];

    const result = groupTagsByPrefix(tags);

    expect(result.grouped.size).toBe(0);
    expect(result.ungrouped).toHaveLength(2);
  });

  it('複数のグループ', () => {
    const tags = [
      makeTag({ name: '開発:api' }),
      makeTag({ name: '開発:frontend' }),
      makeTag({ name: '運動:ランニング' }),
      makeTag({ name: '運動:筋トレ' }),
      makeTag({ name: '読書' }),
    ];

    const result = groupTagsByPrefix(tags);

    expect(result.grouped.size).toBe(2);
    expect(result.grouped.has('開発')).toBe(true);
    expect(result.grouped.has('運動')).toBe(true);
    expect(result.ungrouped.map((t) => t.name)).toEqual(['読書']);
  });
});

describe('getTagDisplayLabel', () => {
  it('グループ外 → タグ名全体', () => {
    expect(getTagDisplayLabel('開発:api', false)).toBe('開発:api');
  });

  it('グループ内 → suffix部分', () => {
    expect(getTagDisplayLabel('開発:api', true)).toBe('api');
  });

  it('コロンなし + グループ内 → 名前全体', () => {
    expect(getTagDisplayLabel('運動', true)).toBe('運動');
  });

  it('デフォルトは inGroup=false', () => {
    expect(getTagDisplayLabel('開発:api')).toBe('開発:api');
  });
});

describe('buildColonTagName', () => {
  it('prefix + suffix → コロン記法', () => {
    expect(buildColonTagName('開発', 'api')).toBe('開発:api');
  });

  it('prefix のみ → そのまま', () => {
    expect(buildColonTagName('運動')).toBe('運動');
  });

  it('suffix が空文字 → prefix のみ', () => {
    expect(buildColonTagName('運動', '')).toBe('運動');
  });
});
