'use client';

import { forwardRef } from 'react';

import { cn } from '@dayopt/components';

interface SidebarIconButtonProps extends React.ComponentProps<'button'> {
  /** 読み上げ用の名前。アイコンしか持たないので必須にする */
  'aria-label': string;
  /**
   * 常時は隠し、囲っている group にホバー / フォーカスした時だけ出す。
   * 値は Tailwind の named group（`group/item` なら 'item'）。
   * 省略すると常時表示。
   */
  revealOn?: 'item' | 'section' | undefined;
}

/**
 * サイドバーの 24px アイコンボタン（見出しの ⋯ / 開閉 chevron / 表示トグル）。
 *
 * 見た目は 24px のままタップターゲットだけ 44px を確保する（AGENTS.md の
 * Non-Negotiables）。擬似要素で広げるので、隣のボタンとの間隔は詰まったまま
 * 押しやすさだけが上がる。
 *
 * これを作る前は同じ 300 文字超の className が 6 箇所へコピーされていて、
 * うち 3 箇所は `before:-inset-2`（24 + 8*2 = 40px）で 44px に届いていなかった。
 * 同じ行に並ぶ 2 つのボタンでタップ範囲が違う状態だったので、寸法の決定を
 * ここ 1 箇所へ集約する（2026-09-04）。
 *
 * `@dayopt/components` の `Button` は使えない。`icon` の最小が `size="sm"` の
 * 32px で、サイドバーの 24px を表現できないため。24px を DS の公開サイズ表へ
 * 足すと text ボタン側にも無い段を増やすことになるので、shell 側で閉じている。
 */
export const SidebarIconButton = forwardRef<HTMLButtonElement, SidebarIconButtonProps>(
  function SidebarIconButton({ className, revealOn, type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素の 44px ヒットエリアに空 content が必要
          "text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity duration-150 after:absolute after:inset-0 after:m-auto after:size-11 after:content-[''] focus-visible:ring-2 focus-visible:outline-none",
          // ホバーで現れる affordance は、キーボードとタッチからも到達できる形にする。
          // focus-visible は自分自身、group-has-[:focus-visible] は兄弟からの到達、
          // hover:none はタッチ端末（ホバーが無いので常時出す）
          revealOn === 'item' &&
            'opacity-0 group-hover/item:opacity-100 group-has-[:focus-visible]/item:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
          revealOn === 'section' &&
            'opacity-0 group-hover/section:opacity-100 group-has-[:focus-visible]/section:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
          className,
        )}
        {...props}
      />
    );
  },
);
