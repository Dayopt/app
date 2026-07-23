import MiniSearch, { type SearchResult as MiniSearchResult } from 'minisearch';

/**
 * ビルド時に生成される検索インデックスの1エントリ。
 * 生成側は scripts/generate-search-index.ts。
 */
export interface SearchIndexEntry {
  id: string;
  title: string;
  description: string;
  content: string;
  url: string;
  type: 'blog' | 'docs';
  tags: string[];
  category: string;
  date: string;
}

/** 日本語・中国語・韓国語の文字（ひらがな・カタカナ・漢字） */
const CJK_CHAR = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff';
const CJK_TEST = new RegExp(`[${CJK_CHAR}]`);
const CJK_RUN = new RegExp(`[${CJK_CHAR}]+|[^${CJK_CHAR}]+`, 'g');
const WORD_SEPARATOR = /[\s\-_/,.;:!?'"()[\]{}<>|\\+*=~`@#$%^&、。「」『』（）・…]+/;

/**
 * CJK 対応トークナイザ。
 *
 * MiniSearch の既定トークナイザは空白・記号で分割するため、分かち書きしない日本語では
 * 文全体が1トークンになり検索できない。CJK 部分は文字 bigram に分解して部分一致を可能にする
 * （形態素解析器を持ち込まずに CJK を扱う定石）。ラテン文字は語単位のまま残す。
 *
 * index 時と検索時の両方で同じ関数が使われるため、bigram 同士が対応する。
 * 1文字クエリは prefix 検索で bigram の先頭に一致する（「予」→「予定」）。
 */
export function tokenize(text: string): string[] {
  return text
    .split(WORD_SEPARATOR)
    .flatMap((segment) => (segment ? tokenizeSegment(segment) : []))
    .filter(Boolean);
}

function tokenizeSegment(segment: string): string[] {
  const runs = segment.match(CJK_RUN) ?? [];
  const tokens: string[] = [];

  for (const run of runs) {
    if (!CJK_TEST.test(run)) {
      tokens.push(run);
      continue;
    }

    if (run.length === 1) {
      tokens.push(run);
      continue;
    }

    for (let i = 0; i < run.length - 1; i += 1) {
      tokens.push(run.slice(i, i + 2));
    }
  }

  return tokens;
}

function extractField(document: SearchIndexEntry, fieldName: string): string {
  const value = document[fieldName as keyof SearchIndexEntry];
  if (Array.isArray(value)) return value.join(' ');
  return typeof value === 'string' ? value : '';
}

/** エントリ配列から MiniSearch インデックスを構築する */
export function createSearchIndex(entries: SearchIndexEntry[]): MiniSearch<SearchIndexEntry> {
  const miniSearch = new MiniSearch<SearchIndexEntry>({
    fields: ['title', 'description', 'content', 'tags'],
    storeFields: ['id', 'title', 'description', 'url', 'type', 'category', 'date'],
    tokenize,
    processTerm: (term) => term.toLowerCase(),
    extractField,
    searchOptions: {
      boost: { title: 3, description: 2, tags: 2 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
    },
  });

  miniSearch.addAll(entries);
  return miniSearch;
}

/**
 * インデックスを検索する。
 *
 * 既定は AND（語を足すほど絞り込まれる、一般的な検索 UX）。0件なら OR で再検索して
 * 「長い文を投げると何も出ない」状態を避ける。
 */
export function searchEntries(
  index: MiniSearch<SearchIndexEntry>,
  query: string,
  limit = 50,
): MiniSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const strict = index.search(trimmed);
  const hits = strict.length > 0 ? strict : index.search(trimmed, { combineWith: 'OR' });

  return hits.slice(0, limit);
}
