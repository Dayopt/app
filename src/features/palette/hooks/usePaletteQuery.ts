import { api } from '@/lib/trpc';

/** パレットアイテム一覧の query hook */
export function usePaletteItems() {
  return api.palette.list.useQuery();
}

/** パレットアイテムの型（router の返り値から推論） */
export type PaletteItem = NonNullable<ReturnType<typeof usePaletteItems>['data']>[number];
