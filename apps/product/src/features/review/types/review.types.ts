import type { ReviewGranularity } from '../stores/useReviewFilterStore';

/** ReviewView のプロパティ */
export interface ReviewViewProps {
  className?: string | undefined;
}

/** ReviewView dispatcher のプロパティ（URL からの初期値復元付き） */
export interface ReviewViewRootProps extends ReviewViewProps {
  /** URL の ?g=。指定時は store に反映してから描画する */
  initialGranularity?: ReviewGranularity | undefined;
  /** URL の ?d=（YYYY-MM-DD）。指定時は store に反映してから描画する */
  initialDateStr?: string | undefined;
}
