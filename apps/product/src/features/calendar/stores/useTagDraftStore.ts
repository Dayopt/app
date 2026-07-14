import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';

/**
 * Tag タップで開く draft entry 作成 popover の状態管理
 *
 * sidebar の tag を tap → openDraft({ tag, date, startTime, endTime })
 *   → calendar に draft block を描画 + popover/drawer 表示
 * 時間変更は popover 入力 / calendar 上の drag-resize の両方からこの store に流れる
 * submit → useEntryMutations.createEntry → closeDraft
 */

interface DraftTagSummary {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface TagDraft {
  tag: DraftTagSummary;
  date: Date;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

interface TagDraftState {
  draft: TagDraft | null;
  openDraft: (draft: TagDraft) => void;
  updateTimes: (next: { startTime?: string; endTime?: string; date?: Date }) => void;
  updateTag: (nextTag: DraftTagSummary) => void;
  closeDraft: () => void;
}

const useTagDraftStoreBase = create<TagDraftState>()(
  devtools(
    (set) => ({
      draft: null,
      openDraft: (draft) => set({ draft }),
      updateTimes: (next) =>
        set((state) => {
          if (!state.draft) return state;
          return {
            draft: {
              ...state.draft,
              ...(next.startTime !== undefined ? { startTime: next.startTime } : {}),
              ...(next.endTime !== undefined ? { endTime: next.endTime } : {}),
              ...(next.date !== undefined ? { date: next.date } : {}),
            },
          };
        }),
      updateTag: (nextTag) =>
        set((state) => {
          if (!state.draft) return state;
          return { draft: { ...state.draft, tag: nextTag } };
        }),
      closeDraft: () => set({ draft: null }),
    }),
    { name: 'tag-draft', enabled: process.env.NODE_ENV !== 'production' },
  ),
);

export const useTagDraftStore = createSelectors(useTagDraftStoreBase);
