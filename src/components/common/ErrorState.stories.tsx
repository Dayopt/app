import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { ErrorState } from './ErrorState';

const meta = {
  title: 'Components/Common/ErrorState',
  component: ErrorState,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof ErrorState>;

/** デフォルト（size="md"、リトライボタン付き）。 */
export const Default: Story = {
  args: {
    title: 'データの読み込みに失敗しました',
    description: '問題が発生しました。もう一度お試しください。',
    onRetry: () => {},
  },
};

/** カード内（size="sm" + centered）。 */
export const InCard: Story = {
  render: () => (
    <div className="border-border h-64 w-80 rounded-lg border">
      <ErrorState title="読み込みに失敗しました" onRetry={() => {}} size="sm" centered />
    </div>
  ),
};

/** フルページ（size="lg"）。 */
export const LargeSize: Story = {
  args: {
    title: '統計の読み込みに失敗しました',
    description: 'しばらくしてからもう一度お試しください。',
    onRetry: () => {},
    size: 'lg',
  },
};

/** カスタムアイコン。 */
export const CustomIcon: Story = {
  args: {
    title: 'ネットワークに接続できません',
    description: 'インターネット接続を確認してください。',
    icon: WifiOff,
    onRetry: () => {},
  },
};

/** カスタムアクション。 */
export const WithCustomActions: Story = {
  args: {
    title: 'データの読み込みに失敗しました',
    actions: (
      <div className="flex justify-center gap-2">
        <Button variant="outline">再試行</Button>
        <Button variant="ghost">ホームに戻る</Button>
      </div>
    ),
  },
};

/** 全サイズ一覧。 */
export const AllSizes: Story = {
  render: () => (
    <div className="flex w-[600px] flex-col gap-6">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size}>
          <p className="text-muted-foreground mb-2 text-xs font-bold">{size}</p>
          <div className="border-border rounded-lg border">
            <ErrorState
              title="データの読み込みに失敗しました"
              description="もう一度お試しください。"
              onRetry={() => {}}
              size={size}
            />
          </div>
        </div>
      ))}
    </div>
  ),
};
