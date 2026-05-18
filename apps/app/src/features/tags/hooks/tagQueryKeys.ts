// タグ用クエリキー定義

/** TanStack Query用タグクエリキー定義 */
export const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  list: () => [...tagKeys.lists()] as const,
  hierarchies: () => [...tagKeys.all, 'hierarchy'] as const,
  hierarchy: () => [...tagKeys.hierarchies()] as const,
  details: () => [...tagKeys.all, 'detail'] as const,
  detail: (id: string) => [...tagKeys.details(), id] as const,
};
