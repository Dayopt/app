/** ツアーの各ステップ識別子 */
export type TourStepId =
  | 'intro'
  | 'grid-drag-entry'
  | 'select-tag-entry'
  | 'explain-tags'
  | 'planned-vs-actual';

/** ツアーステップの配置方向 */
export type TourStepPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

// ---------------------------------------------------------------------------
// FSM 型
// ---------------------------------------------------------------------------

/** ステートマシンの状態 */
export type TourStatus = 'idle' | 'before-enter' | 'active' | 'done' | 'completed';

/** ステートマシンのイベント */
export type TourEvent =
  | { type: 'START' }
  | { type: 'BEFORE_ENTER_COMPLETE'; stepId: TourStepId }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'SKIP' }
  | { type: 'COMPLETE' }
  | { type: 'RESET' };

// ---------------------------------------------------------------------------
// ステップ定義用 discriminated union
// ---------------------------------------------------------------------------

/** 自動進行戦略 */
export type AutoAdvanceStrategy = {
  type: 'dom-observe';
  /** MutationObserver を attach する親要素 */
  targetSelector: string;
  /** addedNodes の中でマッチさせるセレクタ */
  matchSelector: string;
};

/** ステップ表示前に実行するアクション */
export type BeforeEnterAction =
  | { type: 'scroll-to-past'; paddingHours?: number | undefined }
  | { type: 'scroll-to-element'; selector: string }
  | { type: 'wait-for-element'; selector: string; timeoutMs?: number | undefined };

/** ランタイムスキップ条件（true を返すとスキップ） */
export type SkipCondition = () => boolean;

/** カスタムリッチコンテンツのキー */
export type TourContentKey = 'tag-explain' | 'planned-vs-actual-visual';

// ---------------------------------------------------------------------------
// ステップ定義
// ---------------------------------------------------------------------------

/** ツアーステップ定義 */
export interface TourStepDef {
  /** ステップ識別子 */
  id: TourStepId;
  /** data-tour-target 属性のセレクタ値（center 配置では空文字） */
  targetSelector: string;
  /** Popover の配置方向。center の場合は中央 Dialog 表示 */
  placement: TourStepPlacement;
  /** i18n キー（title） */
  titleKey: string;
  /** i18n キー（description） */
  descriptionKey: string;
  /** i18n キー（モバイル用description、未指定時はdescriptionKeyを使用） */
  descriptionMobileKey?: string | undefined;
  /** DOM 監視による自動進行 */
  autoAdvance?: AutoAdvanceStrategy | undefined;
  /** ステップ表示前に実行するアクション */
  beforeEnter?: BeforeEnterAction | undefined;
  /** ランタイムスキップ条件 */
  skipWhen?: SkipCondition | undefined;
  /** カスタムリッチコンテンツのキー（TourStepCenter で使用） */
  contentKey?: TourContentKey | undefined;
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

/** ステップバリデーション結果 */
export type StepValidationResult =
  | { valid: true }
  | { valid: false; messageKey?: string | undefined };

/** ステップバリデーター */
export type StepValidator = () => StepValidationResult;

/** ステップバリデーター群（composition 層から注入） */
export type StepValidators = Partial<Record<TourStepId, StepValidator>>;

// ---------------------------------------------------------------------------
// スナップショット（コンポーネント用派生状態）
// ---------------------------------------------------------------------------

/** useTourSnapshot の返り値 */
export interface TourSnapshot {
  status: TourStatus;
  currentStep: TourStepDef | null;
  stepIndex: number;
  totalSteps: number;
  canGoBack: boolean;
  isLastStep: boolean;
}
