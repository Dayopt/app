import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TimeDiffBlock } from './TimeDiffBlock';

/**
 * TimeDiffBlock — 予定 vs 記録の差分バー表示（位置ベース）
 *
 * 開始（早い/予定通り/遅い）× 終了（早い/予定通り/遅い）= 9パターン + 未入力
 *
 * - 点線ボーダー = 計画外の追加時間（overtime）
 * - pattern-hatch = 計画したけど未実行の時間（unexecuted）
 * - タグ色塗り = 計画と実績が重なる実行区間
 */
const meta = {
  title: 'Features/Entry/Inspector/TimeDiffBlock',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// =============================================
// 1. 開始: 予定通り × 終了: 予定通り（ぴったり）
// =============================================

/** ぴったり: バー100%タグ色。バッジ ±0。 */
export const Exact: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="11:00"
        actualStart="10:00"
        actualEnd="11:00"
        tagColor="blue"
      />
    </div>
  ),
};

// =============================================
// 2. 開始: 予定通り × 終了: 遅い（終了が遅れた）
// =============================================

/** 終了が遅れた: 実行区間 + 右に点線。バッジ +30m。 */
export const LateEnd: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="11:00"
        actualStart="10:00"
        actualEnd="11:30"
        tagColor="green"
      />
    </div>
  ),
};

// =============================================
// 3. 開始: 予定通り × 終了: 早い（短く終わった）
// =============================================

/** 短く終わった: 実行区間 + 右にハッチ。バッジ -15m。 */
export const EarlyEnd: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="11:00"
        actualStart="10:00"
        actualEnd="10:45"
        tagColor="red"
      />
    </div>
  ),
};

// =============================================
// 4. 開始: 早い × 終了: 予定通り（早く始めて予定通り終わった）
// =============================================

/** 早く始めて予定通り終わった: 左に点線 + 実行区間。バッジ +15m。 */
export const EarlyStartOnTimeEnd: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="11:00"
        actualStart="09:45"
        actualEnd="11:00"
        tagColor="violet"
      />
    </div>
  ),
};

// =============================================
// 5. 開始: 早い × 終了: 遅い（両方向に超過）
// =============================================

/** 両方向に超過: 左に点線 + 実行区間 + 右に点線。バッジ +45m。 */
export const EarlyStartLateEnd: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="11:00"
        actualStart="09:45"
        actualEnd="11:30"
        tagColor="teal"
      />
    </div>
  ),
};

// =============================================
// 6. 開始: 早い × 終了: 早い（早く始めて早く終わった）
// =============================================

/** 早く始めて早く終わった: 左に点線 + 実行区間 + 右にハッチ。バッジ ±0。 */
export const EarlyStartEarlyEnd: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="11:00"
        actualStart="09:45"
        actualEnd="10:45"
        tagColor="indigo"
      />
    </div>
  ),
};

// =============================================
// 7. 開始: 遅い × 終了: 予定通り（遅れて始めて予定通り終わった）
// =============================================

/** 遅れて始めて予定通り終わった: 左にハッチ + 実行区間。バッジ -15m。 */
export const LateStartOnTimeEnd: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="11:00"
        actualStart="10:15"
        actualEnd="11:00"
        tagColor="pink"
      />
    </div>
  ),
};

// =============================================
// 8. 開始: 遅い × 終了: 遅い（遅れて始めて超過）
// =============================================

/** 遅れて始めて超過: 左にハッチ + 実行区間 + 右に点線。バッジ +15m。 */
export const LateStartLateEnd: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="11:00"
        actualStart="10:15"
        actualEnd="11:30"
        tagColor="amber"
      />
    </div>
  ),
};

// =============================================
// 9. 開始: 遅い × 終了: 早い（遅れて始めて早く終わった）
// =============================================

/** 遅れて始めて早く終わった: 左にハッチ + 実行区間 + 右にハッチ。バッジ -30m。 */
export const LateStartEarlyEnd: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="11:00"
        actualStart="10:15"
        actualEnd="10:45"
        tagColor="orange"
      />
    </div>
  ),
};

// =============================================
// 10. 計画外（予定duration=0、記録あり）
// =============================================

/** 計画外: 予定がないが記録がある。全点線バー + 「計画外」バッジ。 */
export const Unplanned: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="10:00"
        actualStart="10:00"
        actualEnd="11:30"
        tagColor="blue"
      />
    </div>
  ),
};

// =============================================
// 11. actual未入力（return null）
// =============================================

/** actual未入力: 表示なし。 */
export const NoActual: Story = {
  render: () => (
    <div className="w-80">
      <p className="text-muted-foreground mb-2 text-xs">actual 未入力のため非表示（return null）</p>
      <TimeDiffBlock
        plannedStart="10:00"
        plannedEnd="11:00"
        actualStart={null}
        actualEnd={null}
        tagColor="blue"
      />
    </div>
  ),
};

// =============================================
// 全パターン一覧
// =============================================

/** 全9パターン一覧（タグ色: blue） */
export const AllScenarios: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-8">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">1. ぴったり（±0）</p>
        <TimeDiffBlock
          plannedStart="10:00"
          plannedEnd="11:00"
          actualStart="10:00"
          actualEnd="11:00"
          tagColor="blue"
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">2. 終了が遅れた（+30m）</p>
        <TimeDiffBlock
          plannedStart="10:00"
          plannedEnd="11:00"
          actualStart="10:00"
          actualEnd="11:30"
          tagColor="blue"
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">3. 短く終わった（-15m）</p>
        <TimeDiffBlock
          plannedStart="10:00"
          plannedEnd="11:00"
          actualStart="10:00"
          actualEnd="10:45"
          tagColor="blue"
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">4. 早く始めて予定通り終わった（+15m）</p>
        <TimeDiffBlock
          plannedStart="10:00"
          plannedEnd="11:00"
          actualStart="09:45"
          actualEnd="11:00"
          tagColor="blue"
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">5. 両方向に超過（+45m）</p>
        <TimeDiffBlock
          plannedStart="10:00"
          plannedEnd="11:00"
          actualStart="09:45"
          actualEnd="11:30"
          tagColor="blue"
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">6. 早く始めて早く終わった（±0）</p>
        <TimeDiffBlock
          plannedStart="10:00"
          plannedEnd="11:00"
          actualStart="09:45"
          actualEnd="10:45"
          tagColor="blue"
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">7. 遅れて始めて予定通り終わった（-15m）</p>
        <TimeDiffBlock
          plannedStart="10:00"
          plannedEnd="11:00"
          actualStart="10:15"
          actualEnd="11:00"
          tagColor="blue"
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">8. 遅れて始めて超過（+15m）</p>
        <TimeDiffBlock
          plannedStart="10:00"
          plannedEnd="11:00"
          actualStart="10:15"
          actualEnd="11:30"
          tagColor="blue"
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">9. 遅れて始めて早く終わった（-30m）</p>
        <TimeDiffBlock
          plannedStart="10:00"
          plannedEnd="11:00"
          actualStart="10:15"
          actualEnd="10:45"
          tagColor="blue"
        />
      </div>
    </div>
  ),
};

// =============================================
// タグ色バリエーション
// =============================================

/** タグ色バリエーション（同じ超過パターンを色違いで表示） */
export const TagColorVariations: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      {(
        [
          'blue',
          'red',
          'green',
          'violet',
          'amber',
          'teal',
          'orange',
          'pink',
          'indigo',
          'gray',
        ] as const
      ).map((color) => (
        <div key={color} className="space-y-1">
          <p className="text-muted-foreground text-xs">{color}</p>
          <TimeDiffBlock
            plannedStart="10:00"
            plannedEnd="11:00"
            actualStart="10:00"
            actualEnd="11:30"
            tagColor={color}
          />
        </div>
      ))}
    </div>
  ),
};
