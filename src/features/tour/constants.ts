import type { TourStepDef } from './types';

/** 過去ドラッグステップをスキップする閾値（時） */
export const TOUR_MIN_PAST_HOURS = 1;

/** ツアー自動開始の遅延時間（ms） */
export const TOUR_START_DELAY = 500;

/** beforeEnter スクロール完了待ち時間（ms） */
export const TOUR_SCROLL_DELAY = 500;

/** ツアーステップ定義（表示順） */
export const TOUR_STEPS: TourStepDef[] = [
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
    autoAdvance: {
      type: 'dom-observe',
      targetSelector: '[data-tour-target="grid-drag"]',
      matchSelector: '[data-tag-palette]',
    },
  },
  {
    id: 'select-tag-plan',
    targetSelector: '[data-tour-target="grid-drag"]',
    placement: 'bottom',
    titleKey: 'tour.steps.selectTagPlan.title',
    descriptionKey: 'tour.steps.selectTagPlan.description',
    autoAdvance: {
      type: 'dom-observe',
      targetSelector: '[data-tour-target="grid-drag"]',
      matchSelector: '[data-entry-card]',
    },
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
    autoAdvance: {
      type: 'dom-observe',
      targetSelector: '[data-tour-target="grid-drag"]',
      matchSelector: '[data-tag-palette]',
    },
    beforeEnter: { type: 'scroll-to-past', paddingHours: 3 },
    skipWhen: () => new Date().getHours() < TOUR_MIN_PAST_HOURS,
  },
  {
    id: 'select-tag-record',
    targetSelector: '[data-tour-target="grid-drag"]',
    placement: 'bottom',
    titleKey: 'tour.steps.selectTagRecord.title',
    descriptionKey: 'tour.steps.selectTagRecord.description',
    autoAdvance: {
      type: 'dom-observe',
      targetSelector: '[data-tour-target="grid-drag"]',
      matchSelector: '[data-entry-card]',
    },
    skipWhen: () => new Date().getHours() < TOUR_MIN_PAST_HOURS,
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
