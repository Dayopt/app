import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Calendar, Clock, MoreHorizontal, Tag } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dayopt/components';

const meta = {
  title: 'Shared/Patterns/Cards',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">Card Patterns</h1>
      <p className="text-muted-foreground mb-8">
        カードUIのパターン。情報表示、アクション、レイアウトの使い分け。
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* 使い分けガイド */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">使い分けガイド</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">パターン</th>
                  <th className="py-2 text-left font-medium">用途</th>
                  <th className="py-2 text-left font-medium">特徴</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">基本カード</td>
                  <td className="py-2">情報のグループ化</td>
                  <td className="py-2">タイトル＋説明＋コンテンツ</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">アクションカード</td>
                  <td className="py-2">操作可能なアイテム</td>
                  <td className="py-2">メニュー＋ボタン</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">ステータスカード</td>
                  <td className="py-2">状態表示</td>
                  <td className="py-2">バッジ＋進捗</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">メトリクスカード</td>
                  <td className="py-2">数値・統計表示</td>
                  <td className="py-2">大きな数値＋トレンド</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 基本カード */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">基本カード</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            情報をグループ化。タイトル、説明、コンテンツで構成。
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>カードタイトル</CardTitle>
                <CardDescription>カードの説明文がここに入ります。</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  カードのメインコンテンツ。テキスト、画像、フォームなど様々な要素を配置できます。
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>フッター付きカード</CardTitle>
                <CardDescription>アクションボタンを下部に配置。</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  コンテンツエリア。フッターと組み合わせて使用。
                </p>
              </CardContent>
              <CardFooter className="justify-end gap-2">
                <Button variant="outline">キャンセル</Button>
                <Button>保存</Button>
              </CardFooter>
            </Card>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<Card>
  <CardHeader>
    <CardTitle>タイトル</CardTitle>
    <CardDescription>説明</CardDescription>
  </CardHeader>
  <CardContent>
    コンテンツ
  </CardContent>
  <CardFooter>
    <Button>アクション</Button>
  </CardFooter>
</Card>`}
          </pre>
        </section>

        {/* アクションカード */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">アクションカード</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            ヘッダーにアクションボタン。CardActionで右上に配置。
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>プロジェクトA</CardTitle>
                <CardDescription>期限: 2024/12/31</CardDescription>
                <CardAction>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" icon>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>編集</DropdownMenuItem>
                      <DropdownMenuItem>複製</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">削除</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant="primary">進行中</Badge>
                  <span className="text-muted-foreground text-sm">24時間</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>タスク管理</CardTitle>
                <CardDescription>今日の進捗</CardDescription>
                <CardAction>
                  <Button variant="outline" size="sm">
                    詳細
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-muted-foreground text-sm">5 / 10 タスク完了</div>
              </CardContent>
            </Card>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<Card>
  <CardHeader>
    <CardTitle>タイトル</CardTitle>
    <CardDescription>説明</CardDescription>
    <CardAction>
      <Button variant="ghost" icon>
        <MoreHorizontal className="size-4" />
      </Button>
    </CardAction>
  </CardHeader>
</Card>`}
          </pre>
        </section>

        {/* ステータスカード */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">ステータスカード</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            タスクやプロジェクトの状態を表示。バッジとメタ情報。
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="hover:bg-state-hover cursor-pointer transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Badge variant="primary">進行中</Badge>
                  <span className="text-muted-foreground text-xs">2時間前</span>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="mb-1">週次レポート作成</h3>
                <p className="text-muted-foreground text-sm">プロジェクトAの進捗をまとめる</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    12/15
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3.5" />
                    2h
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Tag className="size-3.5" />
                    仕事
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:bg-state-hover cursor-pointer transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Badge variant="success">完了</Badge>
                  <span className="text-muted-foreground text-xs">昨日</span>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="mb-1">ミーティング準備</h3>
                <p className="text-muted-foreground text-sm">資料の確認と質問事項の整理</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    12/14
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3.5" />
                    1h
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:bg-state-hover cursor-pointer transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Badge variant="warning">期限切れ</Badge>
                  <span className="text-muted-foreground text-xs">3日前</span>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="mb-1">コードレビュー</h3>
                <p className="text-muted-foreground text-sm">PR #123 のレビュー</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-destructive flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    12/12
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3.5" />
                    30m
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* メトリクスカード */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">メトリクスカード</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            数値・統計を強調表示。トレンドアイコンで変化を表現。
          </p>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">今日の作業時間</p>
                <p className="text-3xl font-medium">6.5h</p>
                <p className="text-success mt-1 text-sm">+1.2h 昨日比</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">完了タスク</p>
                <p className="text-3xl font-medium">12</p>
                <p className="text-muted-foreground mt-1 text-sm">今週の合計</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">進行中</p>
                <p className="text-3xl font-medium">3</p>
                <p className="text-warning mt-1 text-sm">1件期限超過</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">生産性スコア</p>
                <p className="text-3xl font-medium">85%</p>
                <p className="text-success mt-1 text-sm">+5% 先週比</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* カードグリッド */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">カードグリッド</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            レスポンシブなカードレイアウト。grid + gap で配置。
          </p>

          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-xs">
            {`// 2列グリッド（md以上）
<div className="grid gap-4 md:grid-cols-2">
  <Card>...</Card>
  <Card>...</Card>
</div>

// 3列グリッド（lg以上）
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  <Card>...</Card>
</div>

// 4列グリッド（xl以上）
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  <Card>...</Card>
</div>`}
          </pre>
        </section>

        {/* ベストプラクティス */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">ベストプラクティス</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>一貫したカード構造を使用</li>
                <li>ホバー状態で操作可能を示唆</li>
                <li>適切な余白（gap-4 or gap-6）</li>
                <li>アクションは右上またはフッター</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>カード内に大量のコンテンツ</li>
                <li>異なるサイズのカードを混在</li>
                <li>ネストしたカード</li>
                <li>クリック可能かどうか不明瞭</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
};
