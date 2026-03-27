import type { TourStepDef } from './types';

/** ツアー自動開始の遅延時間（ms） */
export const TOUR_START_DELAY = 500;

/** beforeEnter スクロール完了待ち時間（ms） */
export const TOUR_SCROLL_DELAY = 500;

/** ツアーのステップ定義一覧（表示順） */
export const TOUR_STEPS: TourStepDef[] = [
  {
    id: 'intro',
    targetSelector: '',
    placement: 'center',
    titleKey: 'tour.steps.intro.title',
    descriptionKey: 'tour.steps.intro.description',
  },
  {
    id: 'grid-drag-entry',
    targetSelector: '[data-tour-target="grid-drag"]',
    placement: 'bottom',
    titleKey: 'tour.steps.gridDragPlan.title',
    descriptionKey: 'tour.steps.gridDragPlan.description',
    descriptionMobileKey: 'tour.steps.gridDragPlan.descriptionMobile',
    autoAdvance: {
      type: 'dom-observe',
      targetSelector: '[data-tour-target="grid-drag"]',
      matchSelector: '[data-tag-palette]',
    },
  },
  {
    id: 'select-tag-entry',
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
    id: 'planned-vs-actual',
    targetSelector: '',
    placement: 'center',
    titleKey: 'tour.steps.planVsRecord.title',
    descriptionKey: 'tour.steps.planVsRecord.description',
    contentKey: 'planned-vs-actual-visual',
  },
];

/** ツアーの総ステップ数（スキップ条件適用前の最大値） */
export const TOUR_TOTAL_STEPS = TOUR_STEPS.length;
