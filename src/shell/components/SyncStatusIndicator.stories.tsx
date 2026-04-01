/**
 * SyncStatusIndicator Stories
 *
 * 同期状態インジケーター。
 * オフライン / 同期待ち / 同期失敗 / 正常（非表示）の 4 状態を確認。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertTriangle, Cloud, CloudOff, Loader2 } from 'lucide-react';

// SyncStatusIndicator は useSyncStatus フックに依存するため、
// ストーリーでは同じ見た目の静的モックを使用する。

function MockSyncStatus({
  isOnline = true,
  pendingCount = 0,
  failedCount = 0,
  isSyncing = false,
}: {
  isOnline?: boolean;
  pendingCount?: number;
  failedCount?: number;
  isSyncing?: boolean;
}) {
  if (isOnline && pendingCount === 0 && failedCount === 0) {
    return <span className="text-muted-foreground text-xs italic">（正常時: 非表示）</span>;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {!isOnline && (
        <div className="text-muted-foreground flex items-center gap-1">
          <CloudOff className="h-3.5 w-3.5" />
          <span>オフライン</span>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="text-muted-foreground flex items-center gap-1">
          {isSyncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Cloud className="h-3.5 w-3.5" />
          )}
          <span>{pendingCount}件の変更を同期中</span>
        </div>
      )}

      {failedCount > 0 && (
        <div className="text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{failedCount}件の同期に失敗</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground underline transition-colors"
          >
            クリア
          </button>
        </div>
      )}
    </div>
  );
}

const meta = {
  title: 'Components/Shell/SyncStatusIndicator',
  component: MockSyncStatus,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof MockSyncStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 正常時（オンライン + pending 0 + failed 0）は非表示。 */
export const Normal: Story = {
  args: {
    isOnline: true,
    pendingCount: 0,
    failedCount: 0,
  },
};

/** オフライン状態。 */
export const Offline: Story = {
  args: {
    isOnline: false,
    pendingCount: 0,
    failedCount: 0,
  },
};

/** 同期待ち（同期中）。スピナーアニメーション付き。 */
export const Syncing: Story = {
  args: {
    isOnline: true,
    pendingCount: 3,
    failedCount: 0,
    isSyncing: true,
  },
};

/** 同期待ち（未開始）。 */
export const Pending: Story = {
  args: {
    isOnline: true,
    pendingCount: 5,
    failedCount: 0,
    isSyncing: false,
  },
};

/** 同期失敗。クリアボタン付き。 */
export const Failed: Story = {
  args: {
    isOnline: true,
    pendingCount: 0,
    failedCount: 2,
  },
};

/** オフライン + 同期待ち + 失敗の複合状態。 */
export const Combined: Story = {
  args: {
    isOnline: false,
    pendingCount: 3,
    failedCount: 1,
    isSyncing: false,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">正常（非表示）</p>
        <MockSyncStatus isOnline pendingCount={0} failedCount={0} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">オフライン</p>
        <MockSyncStatus isOnline={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">同期中（スピナー）</p>
        <MockSyncStatus pendingCount={3} isSyncing />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">同期待ち</p>
        <MockSyncStatus pendingCount={5} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">同期失敗</p>
        <MockSyncStatus failedCount={2} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">
          複合（オフライン + 同期待ち + 失敗）
        </p>
        <MockSyncStatus isOnline={false} pendingCount={3} failedCount={1} />
      </div>
    </div>
  ),
};
