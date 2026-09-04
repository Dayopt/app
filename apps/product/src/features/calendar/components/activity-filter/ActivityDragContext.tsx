'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Activity } from '@/features/activities';

import { canDropActivity, type ActivityDropTarget } from './activity-drop-target';
import { useMoveActivityToCategory } from './useMoveActivityToCategory';

/**
 * ドラッグ中のペイロードを運ぶ MIME 型。
 *
 * `text/plain` は使わない。使うと、サイドバーの外（ブロックのタイトル入力欄など）へ
 * 落とした時に生の UUID が貼り付いてしまう。private 型なら他所は受け取らない。
 * Firefox は `dragstart` で `setData()` を呼ばないとドラッグ自体を開始しないため、
 * 値を読むのは state 側でも `setData` 自体は必要。
 */
export const ACTIVITY_DRAG_MIME = 'application/x-dayopt-activity-id';

interface ActivityDragValue {
  /** 掴んでいるアクティビティ。null = ドラッグしていない */
  draggedActivity: Activity | null;
  /** 今カーソルが乗っている有効な drop target */
  activeTarget: ActivityDropTarget | null;
  startDrag: (activity: Activity) => void;
  endDrag: () => void;
  /** `dragover` から呼ぶ。落とせるなら true を返し、ハイライトを更新する */
  hoverTarget: (target: ActivityDropTarget) => boolean;
  /** `drop` から呼ぶ */
  commitDrop: (target: ActivityDropTarget) => void;
}

const ActivityDragContext = createContext<ActivityDragValue | null>(null);

export function useActivityDrag(): ActivityDragValue {
  const value = useContext(ActivityDragContext);
  if (!value) throw new Error('useActivityDrag must be used within ActivityDragProvider');
  return value;
}

interface ActivityDragProviderProps {
  /** 同名衝突の検出に使う全アクティビティ */
  allActivities: Activity[];
  children: ReactNode;
}

/**
 * サイドバーのアクティビティ行を「別カテゴリー / 未分類へ落として所属を変える」
 * ためのドラッグ状態。
 *
 * **なぜ context か**: `dragover` 中はブラウザが `dataTransfer` の中身を読ませない
 * ので、「今どのアクティビティを掴んでいるか」を別経路で共有する必要がある。
 * かつ drop 先（カテゴリー B）は、ドラッグの開始点（カテゴリー A の行）とは
 * 別の subtree にある。props で通すと `ActivityFilterList` 全体が毎 `dragover` で
 * 再 render する。
 *
 * **なぜ Zustand ではないか**: 状態が生きるのはマウスを押している間だけで、
 * このディレクトリの外に読み手がいない（AGENTS.md「Zustand でグローバル、
 * useState でローカル」）。`useCalendarDragStore` が store なのは、カレンダーの
 * 日カラムが互いに別 provider 下の subtree だからで、その事情はここには無い。
 */
export function ActivityDragProvider({ allActivities, children }: ActivityDragProviderProps) {
  const [draggedActivity, setDraggedActivity] = useState<Activity | null>(null);
  const [activeTarget, setActiveTarget] = useState<ActivityDropTarget | null>(null);
  const moveActivity = useMoveActivityToCategory(allActivities);

  const endDrag = useCallback(() => {
    setDraggedActivity(null);
    setActiveTarget(null);
  }, []);

  const startDrag = useCallback((activity: Activity) => {
    setDraggedActivity(activity);
    setActiveTarget(null);
  }, []);

  // 掴んだ行が drag 中に unmount すると（背景の refetch や Realtime で起きる）
  // その行の `dragend` は二度と来ず、ハイライトが永久に残る。window 側でも
  // 終了を拾って必ず畳む
  useEffect(() => {
    if (!draggedActivity) return;

    window.addEventListener('dragend', endDrag);
    window.addEventListener('drop', endDrag);
    return () => {
      window.removeEventListener('dragend', endDrag);
      window.removeEventListener('drop', endDrag);
    };
  }, [draggedActivity, endDrag]);

  const hoverTarget = useCallback(
    (target: ActivityDropTarget) => {
      // ファイルや他アプリからのドラッグには一切反応しない。ここで
      // preventDefault してしまうとブラウザ本来の処理まで殺す
      if (!draggedActivity) return false;
      if (!canDropActivity({ activity: draggedActivity, target, allActivities })) return false;

      // 同じ値なら state を触らない（`dragover` は数十 ms ごとに飛んでくる）
      setActiveTarget((prev) => (prev === target ? prev : target));
      return true;
    },
    [draggedActivity, allActivities],
  );

  const commitDrop = useCallback(
    (target: ActivityDropTarget) => {
      if (!draggedActivity) return;

      // mutate より先にハイライトを消す。楽観的更新が走った瞬間にリストが
      // 並べ替わってドロップ先の箱が動くので、その 1 フレームだけリングが
      // ずれた位置に residual として残る
      endDrag();
      moveActivity(draggedActivity, target);
    },
    [draggedActivity, endDrag, moveActivity],
  );

  const value = useMemo<ActivityDragValue>(
    () => ({ draggedActivity, activeTarget, startDrag, endDrag, hoverTarget, commitDrop }),
    [draggedActivity, activeTarget, startDrag, endDrag, hoverTarget, commitDrop],
  );

  return <ActivityDragContext.Provider value={value}>{children}</ActivityDragContext.Provider>;
}
