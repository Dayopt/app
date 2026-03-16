/** ツアーステップID */
export type TourStepId =
  | 'intro'
  | 'grid-drag-plan'
  | 'select-tag-plan'
  | 'explain-tags'
  | 'grid-drag-record'
  | 'select-tag-record'
  | 'plan-vs-record';

/** ツアーステップの配置方向 */
export type TourStepPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

/** 自動進行の方式 */
export type TourAutoAdvance = 'dom-observe';

/** ステップ表示前に実行するアクション */
export type TourBeforeEnter = 'scroll-to-past';

/** カスタムリッチコンテンツのキー */
export type TourContentKey = 'tag-explain' | 'plan-vs-record-visual';

/** ランタイムスキップ条件 */
export type TourSkipCondition = 'no-past-time';

/** ツアーステップ定義 */
export interface TourStep {
  /** ステップ識別子 */
  id: TourStepId;
  /** data-tour-target 属性のセレクタ値（center 配置では不要） */
  targetSelector: string;
  /** Popover の配置方向（PC）。center の場合は中央 Dialog 表示 */
  placement: TourStepPlacement;
  /** i18n キー（title） */
  titleKey: string;
  /** i18n キー（description） */
  descriptionKey: string;
  /** DOM 監視による自動進行 */
  autoAdvance?: TourAutoAdvance;
  /** 自動進行時に監視する DOM セレクタ */
  observeSelector?: string;
  /** ステップ表示前に実行するアクション */
  beforeEnter?: TourBeforeEnter;
  /** カスタムリッチコンテンツのキー（TourStepCenter で使用） */
  contentKey?: TourContentKey;
  /** ランタイムスキップ条件 */
  skipWhen?: TourSkipCondition;
}
