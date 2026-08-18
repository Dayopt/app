import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';

/**
 * アクティビティタップで開く draft entry 作成 popover の状態管理
 *
 * sidebar の activity を tap → openDraft({ activity, date, startTime, endTime })
 *   → calendar に draft block を描画 + popover/drawer 表示
 * 時間変更は popover 入力 / calendar 上の drag-resize の両方からこの store に流れる
 * submit → useEntryMutations.createEntry → closeDraft
 */

interface DraftActivitySummary {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface ActivityDraft {
  activity: DraftActivitySummary;
  date: Date;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

interface ActivityDraftState {
  draft: ActivityDraft | null;
  openDraft: (draft: ActivityDraft) => void;
  updateTimes: (next: { startTime?: string; endTime?: string; date?: Date }) => void;
  updateActivity: (nextActivity: DraftActivitySummary) => void;
  closeDraft: () => void;
}

const useActivityDraftStoreBase = create<ActivityDraftState>()(
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
      updateActivity: (nextActivity) =>
        set((state) => {
          if (!state.draft) return state;
          return { draft: { ...state.draft, activity: nextActivity } };
        }),
      closeDraft: () => set({ draft: null }),
    }),
    { name: 'activity-draft-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);

export const useActivityDraftStore = createSelectors(useActivityDraftStoreBase);
