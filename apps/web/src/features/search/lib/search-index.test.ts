import { describe, expect, it } from 'vitest';

import { createSearchIndex, searchEntries, tokenize, type SearchIndexEntry } from './search-index';

function entry(overrides: Partial<SearchIndexEntry> & { id: string }): SearchIndexEntry {
  return {
    title: '',
    description: '',
    content: '',
    url: `/docs/${overrides.id}`,
    type: 'docs',
    tags: [],
    category: 'features',
    date: '2026-01-01',
    ...overrides,
  };
}

const ENTRIES: SearchIndexEntry[] = [
  entry({
    id: 'plans',
    title: 'Plans',
    description: 'Create time blocks for your day',
    content: 'A plan is a block of time you set aside before the day starts.',
    tags: ['timeboxing', 'planning'],
  }),
  entry({
    id: 'records',
    title: 'Records',
    description: 'Track what actually happened',
    content: 'A record captures the time you actually spent, not the time you planned.',
    tags: ['tracking'],
  }),
  entry({
    id: 'calendar-ja',
    title: 'カレンダー',
    description: '予定と記録を1つの画面で見る',
    content: 'カレンダーでは予定と実績を並べて確認できます。タイムボックスの設定もここで行います。',
    tags: ['カレンダー'],
  }),
];

describe('tokenize', () => {
  it('ラテン文字は語単位のまま残す', () => {
    expect(tokenize('time blocking guide')).toEqual(['time', 'blocking', 'guide']);
  });

  it('CJK は文字 bigram に分解する（分かち書きしないため）', () => {
    expect(tokenize('予定表')).toEqual(['予定', '定表']);
  });

  it('1文字の CJK はそのまま1トークンにする', () => {
    expect(tokenize('予')).toEqual(['予']);
  });

  it('日本語と英語が混在しても両方を切り出す', () => {
    expect(tokenize('Dayoptの予定')).toEqual(['Dayopt', 'の予', '予定']);
  });

  it('句読点や記号で分割する', () => {
    expect(tokenize('plans, records!')).toEqual(['plans', 'records']);
    expect(tokenize('予定。記録')).toEqual(['予定', '記録']);
  });

  it('空文字では空配列を返す', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('searchEntries', () => {
  const index = createSearchIndex(ENTRIES);

  it('タイトルに一致する記事を返す', () => {
    const hits = searchEntries(index, 'Plans');
    expect(hits[0]?.id).toBe('plans');
  });

  it('本文だけに含まれる語でも見つかる（description には無い語）', () => {
    const hits = searchEntries(index, 'aside');
    expect(hits.map((hit) => hit.id)).toContain('plans');
  });

  it('タグに一致する記事を返す', () => {
    const hits = searchEntries(index, 'timeboxing');
    expect(hits.map((hit) => hit.id)).toContain('plans');
  });

  it('日本語の部分一致で見つかる', () => {
    const hits = searchEntries(index, '予定');
    expect(hits.map((hit) => hit.id)).toContain('calendar-ja');
  });

  it('日本語の本文だけに含まれる語でも見つかる', () => {
    const hits = searchEntries(index, 'タイムボックス');
    expect(hits.map((hit) => hit.id)).toContain('calendar-ja');
  });

  it('1文字違いのタイプミスを許容する', () => {
    const hits = searchEntries(index, 'recods');
    expect(hits.map((hit) => hit.id)).toContain('records');
  });

  it('前方一致で見つかる（入力途中でも結果が出る）', () => {
    const hits = searchEntries(index, 'timebox');
    expect(hits.map((hit) => hit.id)).toContain('plans');
  });

  it('日本語1文字でも前方一致で見つかる', () => {
    const hits = searchEntries(index, '予');
    expect(hits.map((hit) => hit.id)).toContain('calendar-ja');
  });

  it('タイトル一致を本文一致より上位にする', () => {
    const hits = searchEntries(index, 'record');
    expect(hits[0]?.id).toBe('records');
  });

  it('AND で0件なら OR で再検索する（長い入力を空振りさせない）', () => {
    const hits = searchEntries(index, 'plans records calendar');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('一致しない語では空配列を返す', () => {
    expect(searchEntries(index, 'zzzzqqqq')).toEqual([]);
  });

  it('空クエリでは空配列を返す', () => {
    expect(searchEntries(index, '   ')).toEqual([]);
  });

  it('limit で件数を制限する', () => {
    expect(searchEntries(index, 'plans records calendar', 1)).toHaveLength(1);
  });
});
