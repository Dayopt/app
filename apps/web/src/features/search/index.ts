export { SearchDialog } from './components/SearchDialog';
export { useSearch } from './hooks/useSearch';
export type { SearchResult } from './hooks/useSearch';
export {
  SearchHistory,
  generateSearchIndex,
  getPopularSearches,
  getSearchIndex,
  getSearchSuggestions,
  searchByCategory,
  searchContent,
} from './lib/search';
export type { SearchIndexItem } from './lib/search';
