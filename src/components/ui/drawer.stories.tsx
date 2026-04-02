import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Calendar, CheckSquare, FileText, History } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from './button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './drawer';

const meta = {
  title: 'Components/UI/Drawer',
  component: Drawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPatterns: Story = {
  render: function DrawerStory() {
    const [basicOpen, setBasicOpen] = useState(false);
    const [actionOpen, setActionOpen] = useState(false);
    const [snapOpen, setSnapOpen] = useState(false);

    return (
      <div className="flex flex-col items-start gap-6">
        <Drawer open={basicOpen} onOpenChange={setBasicOpen}>
          <DrawerTrigger asChild>
            <Button variant="outline">Drawerを開く</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader className="text-center">
              <DrawerTitle>設定</DrawerTitle>
              <DrawerDescription>アプリケーションの設定を変更します。</DrawerDescription>
            </DrawerHeader>
            <div className="p-4">
              <div className="space-y-4">
                <div className="bg-muted h-10 rounded-lg" />
                <div className="bg-muted h-10 rounded-lg" />
                <div className="bg-muted h-10 rounded-lg" />
              </div>
            </div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="outline">キャンセル</Button>
              </DrawerClose>
              <Button>保存</Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        <Drawer open={actionOpen} onOpenChange={setActionOpen}>
          <DrawerTrigger asChild>
            <Button>作成メニューを開く</Button>
          </DrawerTrigger>
          <DrawerContent className="pb-safe">
            <DrawerHeader className="text-center">
              <DrawerTitle>新規作成</DrawerTitle>
              <DrawerDescription>作成するアイテムを選択してください</DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-2 px-4 pb-6">
              {[
                {
                  icon: Calendar,
                  label: '予定を追加',
                  description: 'カレンダーに予定を追加',
                  color: 'text-primary',
                  bg: 'bg-muted',
                },
                {
                  icon: CheckSquare,
                  label: '実績を記録',
                  description: '完了したタスクを記録',
                  color: 'text-success',
                  bg: 'bg-muted',
                },
                {
                  icon: FileText,
                  label: 'テンプレートから',
                  description: 'テンプレートを使用',
                  color: 'text-muted-foreground',
                  bg: 'bg-muted',
                },
                {
                  icon: History,
                  label: '履歴から',
                  description: '最近の項目から再作成',
                  color: 'text-warning',
                  bg: 'bg-muted',
                },
              ].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="bg-card hover:bg-state-hover border-border flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors active:scale-[0.98]"
                  onClick={() => setActionOpen(false)}
                >
                  <div
                    className={`flex size-12 items-center justify-center rounded-full ${action.bg}`}
                  >
                    <action.icon className={`size-6 ${action.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground font-normal">{action.label}</p>
                    <p className="text-muted-foreground text-sm">{action.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>

        <Drawer
          open={snapOpen}
          onOpenChange={setSnapOpen}
          snapPoints={[0.5, 0.97]}
          fadeFromIndex={1}
        >
          <DrawerTrigger asChild>
            <Button variant="outline">Inspectorを開く</Button>
          </DrawerTrigger>
          <DrawerContent className="flex flex-col gap-0 overflow-hidden p-0">
            <DrawerTitle className="sr-only">詳細パネル</DrawerTitle>
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="mb-4 font-bold">プランの詳細</h3>
              <div className="space-y-4">
                <div className="bg-muted h-20 rounded-lg" />
                <div className="bg-muted h-20 rounded-lg" />
                <div className="bg-muted h-20 rounded-lg" />
                <div className="bg-muted h-20 rounded-lg" />
                <div className="bg-muted h-20 rounded-lg" />
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('button', { name: 'Drawerを開く' });
    await userEvent.click(trigger);

    const body = within(document.body);
    await expect(await body.findByText('アプリケーションの設定を変更します。')).toBeVisible();

    const cancelButton = await body.findByRole('button', { name: 'キャンセル' });
    await userEvent.click(cancelButton);
  },
};
