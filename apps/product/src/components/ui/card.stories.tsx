import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Flame, MoreHorizontal, Trophy } from 'lucide-react';

import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
} from '@dayopt/components';

const meta = {
  title: 'Components/UI/Display/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="text-warning size-5" />
              連続日数
            </CardTitle>
            <CardDescription>継続は力なり</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-3xl font-medium">7</div>
                <div className="text-muted-foreground text-xs">日連続</div>
              </div>
              <div className="bg-border h-12 w-px" />
              <div className="flex items-center gap-2 text-center">
                <Trophy className="text-warning size-4" />
                <div>
                  <div className="text-lg font-medium">14</div>
                  <div className="text-muted-foreground text-xs">最長記録</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">合計時間</CardTitle>
            <CardDescription>今週の記録</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-medium">24:35</div>
            <p className="text-muted-foreground mt-1 text-xs">先週比 +2:15</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="text-warning size-5" />
            連続日数
          </CardTitle>
          <CardDescription>継続は力なり</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>プロジェクト名</CardTitle>
          <CardDescription>2024年1月開始</CardDescription>
          <CardAction>
            <Button variant="ghost" icon aria-label="メニュー">
              <MoreHorizontal className="size-4" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">プロジェクトの詳細説明。</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ログイン</CardTitle>
          <CardDescription>アカウントにログインします。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input id="email" type="email" placeholder="email@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">パスワード</Label>
            <Input id="password" type="password" placeholder="••••••••" />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline">キャンセル</Button>
          <Button>ログイン</Button>
        </CardFooter>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p>シンプルなカード。ヘッダーとフッターなし。</p>
        </CardContent>
      </Card>
    </div>
  ),
};
