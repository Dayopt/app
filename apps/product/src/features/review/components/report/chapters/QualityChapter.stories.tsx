import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { QualityChapter } from './QualityChapter';

import type { ReportCompassPoint } from '../../../domain/report/report-view-model';

/**
 * 3 章「質 — それは良い配分だったか」。
 *
 * 点は充実の回答が 5 件以上のアクティビティだけ。足りない行は名前だけ待機リストへ回る。
 */
const meta = {
  title: 'Product/Features/Review/Chapters/Quality',
  component: QualityChapter,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof QualityChapter>;

export default meta;
type Story = StoryObj<typeof meta>;

const POINTS: ReportCompassPoint[] = [
  {
    activityId: 'act-write',
    categoryName: '仕事',
    name: '執筆',
    color: 'blue',
    x: 92,
    y: 78,
    opacity: 1,
    answerCount: 9,
    recordedMinutes: 600,
  },
  {
    activityId: 'act-mail',
    categoryName: '仕事',
    name: 'メール',
    color: 'violet',
    x: 34,
    y: 22,
    opacity: 0.74,
    answerCount: 6,
    recordedMinutes: 220,
  },
  {
    activityId: 'act-read',
    categoryName: '学習',
    name: '読書',
    color: 'green',
    x: 18,
    y: 66,
    opacity: 0.61,
    answerCount: 5,
    recordedMinutes: 120,
  },
];

export const Default: Story = {
  args: {
    points: POINTS,
    waitingActivities: [
      { activityId: 'act-gym', name: '運動' },
      { activityId: 'act-chore', name: '家事' },
    ],
  },
};

/** 充実に 1 件も回答がない週。盤は空文言だけで、エラーにはならない（仕様 §13-6）。 */
export const NoPoints: Story = {
  args: {
    points: [],
    waitingActivities: [
      { activityId: 'act-gym', name: '運動' },
      { activityId: 'act-write', name: '執筆' },
      { activityId: null, name: null },
    ],
  },
};

/** 待機がいない週。footnote だけが残る。 */
export const NoWaiting: Story = { args: { points: POINTS, waitingActivities: [] } };

/** 記録も回答もまだ無い週。 */
export const Empty: Story = { args: { points: [], waitingActivities: [] } };
