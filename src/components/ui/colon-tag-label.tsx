import { cn } from '@/lib/utils';

type ColonTagLabelVariant = 'separator' | 'suffix-only' | 'chip';

interface ColonTagLabelProps {
  name: string;
  variant?: ColonTagLabelVariant;
  className?: string;
  style?: React.CSSProperties;
}

/** コロンの前後を分割する（最初のコロンのみ） */
function splitColon(name: string): { prefix: string; suffix: string | null } {
  const i = name.indexOf(':');
  if (i === -1) return { prefix: name, suffix: null };
  return { prefix: name.slice(0, i), suffix: name.slice(i + 1) };
}

/**
 * コロンタグの表示ラベル
 *
 * コロン記法タグ（例: "開発:API"）を視認性よく表示する。
 * コロンなしタグはどの variant でもそのまま表示。
 *
 * - **separator**: prefix を薄字 + ›セパレータ + suffix を通常文字
 * - **suffix-only**: suffix 部分のみ表示
 * - **chip**: prefix を小チップ（背景付き）+ suffix
 */
export function ColonTagLabel({
  name,
  variant = 'separator',
  className,
  style,
}: ColonTagLabelProps) {
  const { prefix, suffix } = splitColon(name);

  // コロンなしタグはそのまま表示
  if (suffix === null) {
    return (
      <span className={cn('truncate', className)} style={style}>
        {name}
      </span>
    );
  }

  switch (variant) {
    case 'separator':
      return (
        <span className={cn('truncate', className)} style={style}>
          <span className="text-muted-foreground">{prefix}</span>
          <span className="text-muted-foreground mx-1">›</span>
          <span>{suffix}</span>
        </span>
      );

    case 'suffix-only':
      return (
        <span className={cn('truncate', className)} style={style}>
          {suffix}
        </span>
      );

    case 'chip':
      return (
        <span className={cn('inline-flex min-w-0 items-center gap-1', className)} style={style}>
          <span className="bg-muted shrink-0 rounded px-1 text-xs leading-normal">{prefix}</span>
          <span className="truncate">{suffix}</span>
        </span>
      );
  }
}
