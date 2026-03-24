'use client';

import React from 'react';

import { cn } from '@/lib/utils';

interface MainContentWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * メインコンテンツラッパー
 *
 * loading.tsx を排除し、Next.js の startTransition に任せることで
 * ルート切替時に古いコンテンツを維持 → 新コンテンツ準備完了後に差し替え。
 * Sidebar は layout 層で永続化されるため、メインだけが変わる体験になる。
 */
export function MainContentWrapper({ children, className }: MainContentWrapperProps) {
  return (
    <div className={cn('flex min-h-0 flex-1', className)}>
      <main id="main-content" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
