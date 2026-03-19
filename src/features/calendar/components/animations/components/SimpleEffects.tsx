'use client';

import type { HoverEffectProps } from '../types';

/** スムーズなホバーエフェクトを適用するコンポーネント */
export function HoverEffect({ children, isHovered, disabled = false }: HoverEffectProps) {
  if (disabled) return <>{children}</>;

  return (
    <div
      className={`transition-all duration-150 ${
        isHovered ? 'scale-102 shadow-md brightness-110' : 'scale-100 shadow-sm brightness-100'
      }`}
    >
      {children}
    </div>
  );
}
