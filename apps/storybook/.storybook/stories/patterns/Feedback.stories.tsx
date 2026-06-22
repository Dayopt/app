import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

import { toast } from '@/lib/toast';

import { Button } from '@dayopt/components';

const meta = {
  title: 'Patterns/Feedback',
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
      <h1 className="mb-2 text-2xl font-medium">Feedback Patterns</h1>
      <p className="text-muted-foreground mb-8">
        ユーザーへのフィードバック。Toast、Alert、InlineMessageの使い分け。
      </p>

      <div className="grid max-w-3xl gap-8">
        {/* 使い分けガイド */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">使い分けガイド</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">パターン</th>
                  <th className="py-2 text-left font-medium">用途</th>
                  <th className="py-2 text-left font-medium">例</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">Toast</td>
                  <td className="py-2">一時的な通知。自動で消える。</td>
                  <td className="py-2">「保存しました」「コピーしました」</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">Alert</td>
                  <td className="py-2">重要な情報。ユーザー操作で消す。</td>
                  <td className="py-2">「変更を保存していません」</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">Inline Message</td>
                  <td className="py-2">フィールド固有のフィードバック。</td>
                  <td className="py-2">「メールアドレスが無効です」</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">AlertDialog</td>
                  <td className="py-2">確認が必要な破壊的操作。</td>
                  <td className="py-2">「本当に削除しますか？」</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Toast */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Toast（Sonner）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            一時的な通知。右下に表示され、数秒後に自動で消える。
          </p>

          <div className="space-y-2">
            {/* Success Toast */}
            <div className="bg-background border-border-subtle shadow-card flex items-center gap-2 rounded-lg border p-4">
              <CheckCircle2 className="text-success size-5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">保存しました</p>
              </div>
              <button type="button" className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            {/* Error Toast */}
            <div className="bg-background border-border-subtle shadow-card flex items-center gap-2 rounded-lg border p-4">
              <AlertCircle className="text-destructive size-5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">保存に失敗しました</p>
                <p className="text-muted-foreground text-sm">もう一度お試しください</p>
              </div>
              <button type="button" className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            {/* Info Toast */}
            <div className="bg-background border-border-subtle shadow-card flex items-center gap-2 rounded-lg border p-4">
              <Info className="text-info size-5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">更新があります</p>
                <p className="text-muted-foreground text-sm">新しい機能が追加されました</p>
              </div>
              <button type="button" className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`import { toast } from '@/lib/toast';

// 成功
toast.success('保存しました');

// エラー
toast.error('保存に失敗しました', {
  description: 'もう一度お試しください',
});

// 情報
toast.info('更新があります');

// カスタム
toast('カスタムメッセージ', {
  action: {
    label: '元に戻す',
    onClick: () => handleUndo(),
  },
});`}
          </pre>
        </section>

        {/* Alert Banner */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Alert Banner</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            ページ上部に表示する重要な情報。ユーザー操作で閉じる。
          </p>

          <div className="space-y-2">
            {/* Info */}
            <div className="bg-info-tint border-info flex items-start gap-2 rounded-lg border p-4">
              <Info className="text-info mt-1 size-5 shrink-0" />
              <div className="flex-1">
                <p className="text-info font-medium">新機能</p>
                <p className="text-info text-sm">タグのマージ機能が追加されました。</p>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-warning-tint border-warning flex items-start gap-2 rounded-lg border p-4">
              <AlertTriangle className="text-warning mt-1 size-5 shrink-0" />
              <div className="flex-1">
                <p className="text-warning font-medium">保存されていません</p>
                <p className="text-warning text-sm">変更内容を保存してください。</p>
              </div>
            </div>

            {/* Error */}
            <div className="bg-destructive-tint border-destructive flex items-start gap-2 rounded-lg border p-4">
              <AlertCircle className="text-destructive mt-1 size-5 shrink-0" />
              <div className="flex-1">
                <p className="text-destructive font-medium">接続エラー</p>
                <p className="text-destructive text-sm">
                  サーバーに接続できません。ネットワークを確認してください。
                </p>
              </div>
            </div>

            {/* Success */}
            <div className="bg-success-tint border-success flex items-start gap-2 rounded-lg border p-4">
              <CheckCircle2 className="text-success mt-1 size-5 shrink-0" />
              <div className="flex-1">
                <p className="text-success font-medium">完了</p>
                <p className="text-success text-sm">すべての変更が保存されました。</p>
              </div>
            </div>
          </div>
        </section>

        {/* 使用ガイドライン */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">使用ガイドライン</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>成功/エラーを視覚的に区別</li>
                <li>簡潔なメッセージ</li>
                <li>必要に応じてアクション提示</li>
                <li>適切なタイミングで消える</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>同時に複数のToastを表示</li>
                <li>重要な情報をToastだけで通知</li>
                <li>長文のメッセージ</li>
                <li>消えないToast</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 実装例 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">実装例</h2>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                toast.success('保存しました');
              }}
            >
              成功Toast
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                toast.error('エラーが発生しました');
              }}
            >
              エラーToast
            </Button>
          </div>
        </section>
      </div>
    </div>
  ),
};
