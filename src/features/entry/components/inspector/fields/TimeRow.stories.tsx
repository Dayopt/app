import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Clock } from 'lucide-react';

import { TimeRow, TimeRowPlaceholder } from './TimeRow';

/**
 * TimeRow — 時間入力行
 *
 * ラベル + TimeInput × 2（開始→終了）の構成。
 * 予定行にも記録行にも使用される汎用コンポーネント。
 * `isPrimary` が true のときは記録行として視覚的に強調される。
 */
const meta = {
  title: 'Features/Entry/Inspector/TimeRow',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TimeRowDemo({
  initialStart = '09:00',
  initialEnd = '10:00',
  disabled = false,
  hasError = false,
  isPrimary = false,
}: {
  initialStart?: string;
  initialEnd?: string;
  disabled?: boolean;
  hasError?: boolean;
  isPrimary?: boolean;
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  return (
    <div className="w-80">
      <TimeRow
        label={isPrimary ? '記録時間' : '予定時間'}
        icon={Clock}
        startTime={start}
        endTime={end}
        onStartChange={setStart}
        onEndChange={setEnd}
        disabled={disabled}
        hasError={hasError}
        isPrimary={isPrimary}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 通常の予定時間行。 */
export const Default: Story = {
  render: () => <TimeRowDemo />,
};

/** 記録時間行（isPrimary=true）。ラベルが太字・前景色になる。 */
export const Primary: Story = {
  render: () => <TimeRowDemo isPrimary />,
};

/** エラー状態。TimeInput がエラーカラーで表示される。 */
export const WithError: Story = {
  render: () => <TimeRowDemo hasError />,
};

/** 無効化状態。全てのセレクトが操作不可になる。 */
export const Disabled: Story = {
  render: () => <TimeRowDemo disabled />,
};

/** アイコンなし。 */
export const WithoutIcon: Story = {
  render: () => {
    const [start, setStart] = useState('14:00');
    const [end, setEnd] = useState('15:30');
    return (
      <div className="w-80">
        <TimeRow
          label="時間"
          startTime={start}
          endTime={end}
          onStartChange={setStart}
          onEndChange={setEnd}
        />
      </div>
    );
  },
};

/** TimeRowPlaceholder — 記録なし時のプレースホルダー表示。 */
export const Placeholder: Story = {
  render: () => (
    <div className="w-80">
      <TimeRowPlaceholder label="記録時間" icon={Clock} message="記録なし" />
    </div>
  ),
};

/** TimeRowPlaceholder — muted（薄く表示）。 */
export const PlaceholderMuted: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <div className="w-80">
      <TimeRowPlaceholder label="記録時間" icon={Clock} message="記録なし" muted />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Default（予定時間）</p>
        <TimeRowDemo />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Primary（記録時間・強調）</p>
        <TimeRowDemo isPrimary />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">WithError（エラー状態）</p>
        <TimeRowDemo hasError />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Disabled（無効化）</p>
        <TimeRowDemo disabled />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Placeholder（記録なし）</p>
        <TimeRowPlaceholder label="記録時間" icon={Clock} message="記録なし" />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">PlaceholderMuted（薄く表示）</p>
        <TimeRowPlaceholder label="記録時間" icon={Clock} message="記録なし" muted />
      </div>
    </div>
  ),
};
