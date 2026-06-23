import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Card, CardContent, CardHeader, Skeleton } from '@dayopt/components';

const meta = {
  title: 'Components/UI/Feedback/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * shimmerアニメーション（左→右の波、Facebook/LinkedIn方式）。
 * pulseより最大40%速く感じられるためローディング知覚改善に有効。
 */
export const Shimmer: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <Card>
        <CardHeader className="pb-2">
          <Skeleton variant="shimmer" className="h-5 w-24" />
          <Skeleton variant="shimmer" className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton variant="shimmer" className="h-16 w-full" />
        </CardContent>
      </Card>
      <div className="space-y-2">
        <Skeleton variant="shimmer" className="h-4 w-full" />
        <Skeleton variant="shimmer" className="h-4 w-full" />
        <Skeleton variant="shimmer" className="h-4 w-3/4" />
      </div>
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-[80px]" />
          <Skeleton className="h-[80px]" />
          <Skeleton className="h-[80px]" />
        </div>
        <Skeleton className="h-[120px] w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[100px]" />
          <Skeleton className="h-[100px]" />
        </div>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="border-border rounded-lg border">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-border flex h-12 items-center border-b last:border-b-0">
            <div className="flex w-12 shrink-0 justify-end pr-2">
              <Skeleton className="h-3 w-6" />
            </div>
            <div className="flex-1 px-2">{i === 1 && <Skeleton className="h-8" />}</div>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">shimmerアニメーション（左→右の波）</p>
      <Card>
        <CardHeader className="pb-2">
          <Skeleton variant="shimmer" className="h-5 w-24" />
          <Skeleton variant="shimmer" className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton variant="shimmer" className="h-16 w-full" />
        </CardContent>
      </Card>
    </div>
  ),
};
