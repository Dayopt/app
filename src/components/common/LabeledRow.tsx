'use client';

import type { ReactNode } from 'react';

interface LabeledRowProps {
  label: ReactNode;
  description?: string;
  children: ReactNode;
}

/**
 * 設定画面の行コンポーネント（2カラム: ラベル | コントロール）
 * Apple Settings / ChatGPT 設定画面の標準パターン
 */
export function LabeledRow({ label, description, children }: LabeledRowProps) {
  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-base">{label}</div>
        {description ? <div className="text-muted-foreground text-sm">{description}</div> : null}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}
