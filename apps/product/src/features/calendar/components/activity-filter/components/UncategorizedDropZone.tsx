'use client';

import type { ReactNode } from 'react';

import { cn } from '@dayopt/components';

import { DROP_TARGET_UNCATEGORIZED } from '../activity-drop-target';
import { useActivityDropTarget } from '../useActivityDragHandlers';

interface UncategorizedDropZoneProps {
  children: ReactNode;
}

/**
 * 「未分類」セクションの中身を包む drop 領域（`category_id` を null にする）。
 *
 * 見出し行は含めない。あそこには + と歯車と折りたたみクリックが既にいる。
 *
 * **`min-h-8` は必須。** 未分類の `role="list"` は、アクティブなアクティビティが
 * 0 件だと高さ 0 になり、表示ステータスが「アーカイブ」の時は描画すらされない。
 * 高さを与えないと「カテゴリーから最初の 1 件を出す」という、この機能が一番要る
 * 場面でドロップ先が存在しないことになる。
 *
 * `ActivityFilterList` 本体は `ActivityDragProvider` を自分で置くため、同じ
 * render の中では context を読めない。だからこの薄い子へ切り出している。
 */
export function UncategorizedDropZone({ children }: UncategorizedDropZoneProps) {
  const { isActiveTarget, dropProps } = useActivityDropTarget(DROP_TARGET_UNCATEGORIZED);

  return (
    <div
      className={cn(
        'min-h-8 w-full min-w-0 space-y-1 rounded-lg',
        // ドロップ先の切り替えはカーソル追従なので、fade を入れると遅れて見える
        isActiveTarget && 'bg-state-hover ring-ring ring-2 transition-none ring-inset',
      )}
      {...dropProps}
    >
      {children}
    </div>
  );
}
