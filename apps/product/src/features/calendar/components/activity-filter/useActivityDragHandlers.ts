'use client';

import type { DragEvent, MouseEvent } from 'react';
import { useCallback, useRef } from 'react';

import type { Activity } from '@/features/activities';

import { ACTIVITY_DRAG_MIME, useActivityDrag } from './ActivityDragContext';
import type { ActivityDropTarget } from './activity-drop-target';

/**
 * アクティビティ行を drag source にする props。
 *
 * 標準の HTML5 DnD を使う。しきい値・ドラッグ後の click 抑制・Escape での
 * キャンセル・ドラッグ画像をブラウザが持っているので、自前の pointer machine も
 * DnD ライブラリも要らない（`@dnd-kit` は #2162 で撤去済み）。
 */
export function useActivityDragSource(activity: Activity, enabled: boolean) {
  const { draggedActivity, startDrag, endDrag } = useActivityDrag();

  // 行の中の操作ボタン（👁 / ⋯）を掴んだ時はドラッグさせない。
  //
  // **`dragstart` の `event.target` は掴んだ子ではなく draggable な祖先（行）**
  // なので、`CategoryHeader.handleRowClick` のような closest('button') 判定は
  // dragstart 側では効かない。押した瞬間の本当の target を ref に控えて見る。
  // state ではなく ref なのは、mousedown の setState が dragstart の発火までに
  // 反映される保証がないため。
  //
  // `button` 全部ではなく `[data-row-action]` だけを見る。行の名前もキーボード
  // 経路のために button だが、そこは行の大半を占める一番自然な掴み所なので、
  // ドラッグを止めてしまうと DnD がほぼ機能しなくなる（2026-09-04）。
  const startedOnActionRef = useRef(false);

  const handleMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    startedOnActionRef.current =
      (event.target as HTMLElement).closest('[data-row-action]') !== null;
  }, []);

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (startedOnActionRef.current) {
        event.preventDefault();
        return;
      }

      // Firefox は setData を呼ばないとドラッグを開始しない。値の受け渡し自体は
      // context で行うが、private MIME 型で入れておく
      event.dataTransfer.setData(ACTIVITY_DRAG_MIME, activity.id);
      event.dataTransfer.effectAllowed = 'move';
      startDrag(activity);
    },
    [activity, startDrag],
  );

  return {
    isDragging: draggedActivity?.id === activity.id,
    dragProps: {
      draggable: enabled,
      onMouseDown: handleMouseDown,
      onDragStart: handleDragStart,
      onDragEnd: endDrag,
    },
  };
}

/**
 * カテゴリー群 / 未分類セクションを drop target にする props。
 *
 * ハイライトは `dragenter` / `dragleave` ではなく `dragover` が更新する。
 * `dragover` は対象の上にいる間ずっと飛んでくるので、A から B へ移れば B の
 * `dragover` が上書きするだけで済む。ネストした子要素をまたぐ度に `dragleave` が
 * 出るちらつきが構造的に発生しない。
 */
export function useActivityDropTarget(target: ActivityDropTarget) {
  const { activeTarget, hoverTarget, commitDrop } = useActivityDrag();

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      // 落とせる時だけ preventDefault する。呼ばなければブラウザが
      // 禁止カーソルを出してくれるので、独自の「不可」表現を作らなくていい
      if (hoverTarget(target)) event.preventDefault();
    },
    [hoverTarget, target],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      commitDrop(target);
    },
    [commitDrop, target],
  );

  return {
    isActiveTarget: activeTarget === target,
    dropProps: { onDragOver: handleDragOver, onDrop: handleDrop },
  };
}
