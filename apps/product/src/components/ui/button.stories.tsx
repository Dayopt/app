import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChevronLeft, ChevronRight, Plus, Settings, Trash2, X } from 'lucide-react';

import { Button } from '@dayopt/components';

const meta = {
  title: 'Components/UI/Actions/Button',
  component: Button,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'outline', 'ghost', 'destructive'],
      description: 'ボタンのスタイルバリアント',
    },
    size: {
      control: 'select',
      options: ['sm', 'default', 'lg'],
      description: 'ボタンのサイズ',
    },
    loading: {
      control: 'boolean',
      description: 'ローディング状態',
    },
    disabled: {
      control: 'boolean',
      description: '無効状態',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'ラベル',
    variant: 'primary',
  },
};

export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    return (
      <div className="flex flex-col items-start gap-6">
        <div className="space-y-4">
          <p className="text-muted-foreground text-xs">on surface (default)</p>
          <div className="bg-surface flex items-center gap-4 rounded-lg p-4">
            <Button variant="primary" className="w-28">
              primary
            </Button>
            <Button variant="outline" className="w-28">
              outline
            </Button>
            <Button variant="ghost" className="w-28">
              ghost
            </Button>
            <Button variant="destructive" className="w-28">
              destructive
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">on container</p>
          <div className="bg-container flex items-center gap-4 rounded-lg p-4">
            <Button variant="primary" className="w-28">
              primary
            </Button>
            <Button variant="outline" className="w-28">
              outline
            </Button>
            <Button variant="ghost" className="w-28">
              ghost
            </Button>
            <Button variant="destructive" className="w-28">
              destructive
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">保存</Button>
            <Button variant="primary">送信</Button>
            <Button variant="primary">作成</Button>
            <Button variant="primary">次へ</Button>
            <Button variant="primary">完了</Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline">キャンセル</Button>
            <Button variant="outline">戻る</Button>
            <Button variant="outline">詳細を見る</Button>
            <Button variant="outline">編集</Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" icon aria-label="閉じる">
              <X className="size-4" />
            </Button>
            <Button variant="ghost" icon aria-label="設定">
              <Settings className="size-4" />
            </Button>
            <Button variant="ghost">もっと見る</Button>
            <Button variant="ghost">スキップ</Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-container rounded-lg p-4">
            <div className="flex justify-end gap-2">
              <Button variant="ghost">キャンセル</Button>
              <Button variant="primary">保存</Button>
            </div>
          </div>

          <div className="bg-container rounded-lg p-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline">キャンセル</Button>
              <Button variant="destructive">
                <Trash2 className="size-4" />
                削除
              </Button>
            </div>
          </div>

          <div className="bg-container rounded-lg p-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline">後で</Button>
              <Button variant="outline">今すぐ</Button>
            </div>
          </div>
        </div>

        <div className="bg-container space-y-4 rounded-lg p-4">
          <Button variant="primary" size="sm" className="w-24">
            sm
          </Button>
          <Button variant="primary" size="default" className="w-24">
            default
          </Button>
          <Button variant="primary" size="lg" className="w-24">
            lg
          </Button>
        </div>

        <div className="bg-container space-y-4 rounded-lg p-4">
          <Button variant="ghost" icon size="sm" aria-label="追加">
            <Plus className="size-4" />
          </Button>
          <Button variant="ghost" icon aria-label="設定">
            <Settings className="size-4" />
          </Button>
          <Button variant="ghost" icon size="lg" aria-label="閉じる">
            <X className="size-5" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Button loading>保存中</Button>
          <Button loading loadingText="処理中...">
            保存
          </Button>
          <Button disabled>無効</Button>
        </div>

        <div className="space-y-4">
          <p className="text-muted-foreground text-xs">Grouped（Google Calendar風ボタンバー）</p>
          <p className="text-muted-foreground text-xs">
            共通ボーダーで囲み、内部はdivide-xで区切る。h-8（sm）、ボタンはh-fullで伸ばす。
          </p>
          <div className="flex items-center gap-4">
            <div className="divide-border border-border inline-flex h-8 items-center divide-x overflow-hidden rounded-lg border">
              <button
                type="button"
                className="text-muted-foreground hover:bg-state-hover flex h-full w-8 items-center justify-center transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                className="hover:bg-state-hover flex h-full items-center px-4 text-sm transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:bg-state-hover flex h-full w-8 items-center justify-center transition-colors"
                aria-label="Next"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="divide-border border-border inline-flex h-8 items-center divide-x overflow-hidden rounded-lg border">
              <button
                type="button"
                className="text-muted-foreground hover:bg-state-hover flex h-full w-8 items-center justify-center transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:bg-state-hover flex h-full w-8 items-center justify-center transition-colors"
                aria-label="Next"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
};
