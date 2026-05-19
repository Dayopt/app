import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { QualityDashboard } from './quality-dashboard';
import { samplePreviousSnapshot, sampleSnapshot } from './quality-dashboard/sample-data';
import type { QualitySnapshot } from './quality-dashboard/types';

// 実データを読み込み（存在しない場合はサンプルデータにフォールバック）
let latestSnapshot: QualitySnapshot = sampleSnapshot;
let prevSnapshot: QualitySnapshot = samplePreviousSnapshot;

try {
  latestSnapshot = (await import('../../../../../quality-reports/latest.json'))
    .default as QualitySnapshot;
} catch {
  // quality-reports/latest.json が未生成の場合はサンプルを使用
}

try {
  prevSnapshot = (await import('../../../../../quality-reports/previous.json'))
    .default as QualitySnapshot;
} catch {
  // quality-reports/previous.json が未生成の場合はサンプルを使用
}

/**
 * 品質ダッシュボード — 各監査メトリクスの定点観測ビュー。
 *
 * `pnpm quality:collect` で生成されたJSONを基に表示する。
 * 実データがない場合はサンプルデータを使用。
 */
const meta = {
  title: 'Architecture/Quality/Dashboard',
  component: QualityDashboard,
  parameters: { layout: 'fullscreen' },
  tags: ['docs-only'],
} satisfies Meta<typeof QualityDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 実データ（quality-reports/latest.json）から表示 */
export const Current: Story = {
  args: {
    snapshot: latestSnapshot,
    previousSnapshot: prevSnapshot,
  },
};

/** サンプルデータで表示（デモ用） */
export const Sample: Story = {
  args: {
    snapshot: sampleSnapshot,
    previousSnapshot: samplePreviousSnapshot,
  },
};
