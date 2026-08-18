import { Minus } from 'lucide-react';

import { TagIcon } from '@/features/tags';

interface TimePLTagMarkerProps {
  isNoActivity: boolean;
  categoryIcon: string | null | undefined;
  categoryColor: string | null | undefined;
}

/** アクティビティなしの合成バケット用の中立マーカー。通常行は継承したカテゴリー色を出す。 */
export function TimePLTagMarker({
  isNoActivity,
  categoryIcon,
  categoryColor,
}: TimePLTagMarkerProps) {
  if (isNoActivity) {
    return (
      <span
        data-slot="uncategorized-tag-marker"
        className="bg-muted text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center rounded-full"
        aria-hidden="true"
      >
        <Minus className="size-3" />
      </span>
    );
  }

  return <TagIcon icon={categoryIcon} color={categoryColor} size="sm" />;
}
