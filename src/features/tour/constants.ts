import type { TourStep } from './types';

/** ツアーステップ定義（表示順） */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'intro',
    targetSelector: '',
    placement: 'center',
    titleKey: 'tour.steps.intro.title',
    descriptionKey: 'tour.steps.intro.description',
  },
  {
    id: 'grid-drag-plan',
    targetSelector: '[data-tour-target="grid-drag"]',
    placement: 'bottom',
    titleKey: 'tour.steps.gridDragPlan.title',
    descriptionKey: 'tour.steps.gridDragPlan.description',
    autoAdvance: 'dom-observe',
    observeSelector: '[data-tag-palette]',
  },
  {
    id: 'select-tag-plan',
    targetSelector: '[data-tour-target="grid-drag"]',
    placement: 'bottom',
    titleKey: 'tour.steps.selectTagPlan.title',
    descriptionKey: 'tour.steps.selectTagPlan.description',
    autoAdvance: 'dom-observe',
    observeSelector: '[data-entry-card]',
  },
  {
    id: 'explain-tags',
    targetSelector: '',
    placement: 'center',
    titleKey: 'tour.steps.explainTags.title',
    descriptionKey: 'tour.steps.explainTags.description',
    contentKey: 'tag-explain',
  },
  {
    id: 'grid-drag-record',
    targetSelector: '[data-tour-target="grid-drag"]',
    placement: 'bottom',
    titleKey: 'tour.steps.gridDragRecord.title',
    descriptionKey: 'tour.steps.gridDragRecord.description',
    autoAdvance: 'dom-observe',
    observeSelector: '[data-tag-palette]',
    beforeEnter: 'scroll-to-past',
    skipWhen: 'no-past-time',
  },
  {
    id: 'select-tag-record',
    targetSelector: '[data-tour-target="grid-drag"]',
    placement: 'bottom',
    titleKey: 'tour.steps.selectTagRecord.title',
    descriptionKey: 'tour.steps.selectTagRecord.description',
    autoAdvance: 'dom-observe',
    observeSelector: '[data-entry-card]',
    skipWhen: 'no-past-time',
  },
  {
    id: 'plan-vs-record',
    targetSelector: '',
    placement: 'center',
    titleKey: 'tour.steps.planVsRecord.title',
    descriptionKey: 'tour.steps.planVsRecord.description',
    contentKey: 'plan-vs-record-visual',
  },
];

/** ツアーの総ステップ数（最大） */
export const TOUR_TOTAL_STEPS = TOUR_STEPS.length;

/** ツアー自動開始の遅延時間（ms） */
export const TOUR_START_DELAY = 500;

/** beforeEnter スクロール完了待ち時間（ms） */
export const TOUR_SCROLL_DELAY = 500;

/** 過去ドラッグステップをスキップする閾値（時） */
export const TOUR_MIN_PAST_HOURS = 1;
