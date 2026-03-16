import { create } from 'zustand';

/**
 * Entry mutation ガードストア
 *
 * mutation 実行中フラグのみ管理。Realtime 二重更新防止用。
 * エントリデータのキャッシュは TanStack Query の楽観的更新に一元化。
 */
interface EntryMutationGuardState {
  isMutating: boolean;
  setIsMutating: (value: boolean) => void;
}

export const useEntryCacheStore = create<EntryMutationGuardState>((set) => ({
  isMutating: false,
  setIsMutating: (value) => set({ isMutating: value }),
}));
