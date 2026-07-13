import { describe, expect, it } from 'vitest';

// searchモジュールの内部関数はexportされていないため、
// exportされている関数経由でテストする

// stripMarkdown と calculateScore はprivateなので、
// searchContent / getSearchSuggestions を通じてテスト

// まずモジュールレベルの searchIndex を操作するため、動的importする
describe('search module', () => {
  // searchIndex を直接設定する手段がないため、
  // exportされた関数の振る舞いをテストする

  describe('searchContent', () => {
    it('空クエリは空配列を返す', async () => {
      const { searchContent } = await import('../search');
      expect(searchContent('')).toEqual([]);
      expect(searchContent('  ')).toEqual([]);
    });

    it('インデックスが空なら空配列を返す', async () => {
      const { searchContent, getSearchIndex } = await import('../search');
      // デフォルトでインデックスは空
      expect(getSearchIndex()).toEqual([]);
      expect(searchContent('test')).toEqual([]);
    });
  });

  describe('getSearchSuggestions', () => {
    it('空クエリは空配列を返す', async () => {
      const { getSearchSuggestions } = await import('../search');
      expect(getSearchSuggestions('')).toEqual([]);
      expect(getSearchSuggestions('  ')).toEqual([]);
    });
  });

  describe('getPopularSearches', () => {
    it('静的リストを返す', async () => {
      const { getPopularSearches } = await import('../search');
      const result = getPopularSearches();
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('quickstart');
    });
  });

  describe('searchByCategory', () => {
    it('空インデックスでは空配列を返す', async () => {
      const { searchByCategory } = await import('../search');
      expect(searchByCategory('test', 'docs')).toEqual([]);
    });
  });
});
