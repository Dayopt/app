import { Minus } from 'lucide-react';

import { ActivityIcon } from '@/features/activities';

interface TimePLActivityMarkerProps {
  isNoActivity: boolean;
  categoryIcon: string | null | undefined;
  categoryColor: string | null | undefined;
}

/** アクティビティなしの合成バケット用の中立マーカー。通常行は継承したカテゴリー色を出す。 */
export function TimePLActivityMarker({
  isNoActivity,
  categoryIcon,
  categoryColor,
}: TimePLActivityMarkerProps) {
  if (isNoActivity) {
    return (
      <span
        data-slot="uncategorized-marker"
        className="bg-muted text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center rounded-full"
        aria-hidden="true"
      >
        <Minus className="size-3" />
      </span>
    );
  }

  return <ActivityIcon icon={categoryIcon} color={categoryColor} size="sm" />;
}
