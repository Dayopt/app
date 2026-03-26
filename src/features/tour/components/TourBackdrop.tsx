'use client';

/**
 * ツアー用半透明バックドロップ
 *
 * ターゲット要素以外を暗くして注目を促す。
 * pointer-events: none でユーザー操作を邪魔しない。
 */
export function TourBackdrop() {
  return (
    <div
      className="animate-in fade-in bg-overlay z-tour-backdrop pointer-events-none fixed inset-0 backdrop-blur-sm duration-150"
      aria-hidden="true"
    />
  );
}
