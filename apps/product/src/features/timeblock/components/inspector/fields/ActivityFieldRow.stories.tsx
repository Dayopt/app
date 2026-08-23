import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ActivityFieldRow } from './ActivityFieldRow';

/**
 * ActivityFieldRow — アクティビティ選択トリガー
 *
 * アイコン + アクティビティ名を表示し、クリックで ActivityQuickSelector を開く。
 * `variant` で見た目の重さを切り替える:
 * - `heading`（既定）: activity-filter のブロック作成 popover 用の見出し相当の重さ
 * - `compact`: Plan/Record エディタの時間フィールド直下に置く軽量なタップ要素（#2298）
 *
 * 色・アイコンを持つのはカテゴリーだけで、アクティビティはこれを継承する（#2162 §4-6）。
 * 未分類（継承元が無い）のアクティビティは色を渡さず中立表示になる。
 */
const meta = {
  title: 'Product/Features/Timeblock/Inspector/ActivityFieldRow',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** heading（既定）: activity-filter のブロック作成 popover 用。 */
export const Heading: Story = {
  render: () => (
    <div className="w-72">
      <ActivityFieldRow
        activityId="activity-blue-id"
        activityName="仕事"
        activityColor="blue"
        activityIcon="briefcase"
        onActivityChange={fn()}
        onCreateAndSelect={fn()}
      />
    </div>
  ),
};

/** compact: Plan/Record エディタの時間フィールド直下に置く軽量トリガー。 */
export const Compact: Story = {
  render: () => (
    <div className="w-72">
      <ActivityFieldRow
        variant="compact"
        activityId="activity-blue-id"
        activityName="仕事"
        activityColor="blue"
        activityIcon="briefcase"
        onActivityChange={fn()}
        onCreateAndSelect={fn()}
      />
    </div>
  ),
};

/** 未分類のアクティビティ（継承する色が無いので中立表示）。 */
export const Uncategorized: Story = {
  render: () => (
    <div className="w-72">
      <ActivityFieldRow
        variant="compact"
        activityId="activity-uncategorized"
        activityName="運動"
        activityColor={null}
        activityIcon={null}
        uncategorized
        onActivityChange={fn()}
        onCreateAndSelect={fn()}
      />
    </div>
  ),
};

/** アクティビティ未設定（activityId が null）。 */
export const NoActivity: Story = {
  render: () => (
    <div className="w-72">
      <ActivityFieldRow
        variant="compact"
        activityId={null}
        activityName="アクティビティなし"
        onActivityChange={fn()}
        onCreateAndSelect={fn()}
      />
    </div>
  ),
};

/** 無効化状態。 */
export const Disabled: Story = {
  render: () => (
    <div className="w-72">
      <ActivityFieldRow
        variant="compact"
        activityId="activity-blue-id"
        activityName="仕事"
        activityColor="blue"
        activityIcon="briefcase"
        onActivityChange={fn()}
        onCreateAndSelect={fn()}
        disabled
      />
    </div>
  ),
};

/** 全パターン一覧（heading / compact 見比べ）。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">heading（activity-filter 作成 popover 用）</p>
        <ActivityFieldRow
          activityId="activity-1"
          activityName="仕事"
          activityColor="blue"
          activityIcon="briefcase"
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">compact（Plan/Record エディタ用）</p>
        <ActivityFieldRow
          variant="compact"
          activityId="activity-2"
          activityName="読書"
          activityColor="indigo"
          activityIcon="book-open"
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">未分類（継承する色が無い）</p>
        <ActivityFieldRow
          variant="compact"
          activityId="activity-3"
          activityName="運動"
          activityColor={null}
          activityIcon={null}
          uncategorized
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">アクティビティなし</p>
        <ActivityFieldRow
          variant="compact"
          activityId={null}
          activityName="アクティビティなし"
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">無効化</p>
        <ActivityFieldRow
          variant="compact"
          activityId="activity-5"
          activityName="読書"
          activityColor="indigo"
          activityIcon="book-open"
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
          disabled
        />
      </div>
    </div>
  ),
};
