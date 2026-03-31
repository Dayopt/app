import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel, FieldSupportText } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const meta = {
  title: 'Patterns/Forms',
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
      <h1 className="mb-2 text-2xl font-bold">Form Patterns</h1>
      <p className="text-muted-foreground mb-8">
        フォームのバリデーション、エラー表示、成功状態のパターン集。
      </p>

      <div className="grid max-w-3xl gap-8">
        {/* バリデーションエラー */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">バリデーションエラー</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            フィールド単位でエラーを表示。エラーメッセージは具体的に。
          </p>

          <div className="space-y-4">
            {/* 単一フィールドエラー */}
            <Field>
              <FieldLabel>メールアドレス</FieldLabel>
              <Input placeholder="email@example.com" className="border-destructive" />
              <FieldError>有効なメールアドレスを入力してください</FieldError>
            </Field>

            {/* 文字数制限エラー */}
            <Field>
              <FieldLabel>タグ名</FieldLabel>
              <Input defaultValue="これは非常に長いタグ名で..." className="border-destructive" />
              <FieldError>タグ名は20文字以内で入力してください</FieldError>
            </Field>

            {/* 必須項目エラー */}
            <Field>
              <FieldLabel>プラン名</FieldLabel>
              <Input placeholder="プラン名を入力" className="border-destructive" />
              <FieldError>プラン名は必須です</FieldError>
            </Field>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<Field>
  <FieldLabel>メールアドレス</FieldLabel>
  <Input className="border-destructive" />
  <FieldError>有効なメールアドレスを入力してください</FieldError>
</Field>`}
          </pre>
        </section>

        {/* 成功状態 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">成功状態</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            保存成功時のインラインフィードバック。
          </p>

          <div className="space-y-4">
            <Field>
              <FieldLabel>メールアドレス</FieldLabel>
              <div className="relative">
                <Input defaultValue="user@example.com" className="border-success pr-10" readOnly />
                <CheckCircle2 className="text-success absolute top-1/2 right-3 size-4 -translate-y-1/2" />
              </div>
              <FieldSupportText className="text-success">保存しました</FieldSupportText>
            </Field>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<Field>
  <FieldLabel>メールアドレス</FieldLabel>
  <div className="relative">
    <Input className="border-success pr-10" />
    <CheckCircle2 className="text-success absolute right-3 ..." />
  </div>
  <FieldSupportText className="text-success">保存しました</FieldSupportText>
</Field>`}
          </pre>
        </section>

        {/* サーバーエラー */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">サーバーエラー</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            フォーム全体のエラーはフォーム上部に表示。
          </p>

          <div className="space-y-4">
            {/* エラーバナー */}
            <div className="bg-destructive-tint border-destructive flex items-start gap-3 rounded-lg border p-4">
              <AlertCircle className="text-destructive mt-0.5 size-5 shrink-0" />
              <div>
                <p className="text-destructive font-bold">保存に失敗しました</p>
                <p className="text-destructive text-sm">
                  ネットワーク接続を確認して、もう一度お試しください。
                </p>
              </div>
            </div>

            <Field>
              <FieldLabel>プラン名</FieldLabel>
              <Input defaultValue="朝のルーティン" />
            </Field>

            <Button>再試行</Button>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`// フォーム上部にエラーバナー
<div className="bg-destructive-tint border-destructive ...">
  <AlertCircle className="text-destructive" />
  <div>
    <p className="text-destructive font-bold">保存に失敗しました</p>
    <p className="text-destructive">ネットワーク接続を確認...</p>
  </div>
</div>`}
          </pre>
        </section>

        {/* ヘルプテキスト */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">ヘルプテキスト</h2>
          <p className="text-muted-foreground mb-4 text-sm">入力前にユーザーを支援する補足説明。</p>

          <div className="space-y-4">
            <Field>
              <FieldLabel>パスワード</FieldLabel>
              <Input type="password" placeholder="••••••••" />
              <FieldSupportText>8文字以上、大文字・小文字・数字を含む</FieldSupportText>
            </Field>

            <Field>
              <FieldLabel>タグの説明</FieldLabel>
              <Input placeholder="このタグの用途を説明" />
              <FieldSupportText>省略可。100文字まで。</FieldSupportText>
            </Field>
          </div>
        </section>

        {/* ベストプラクティス */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">ベストプラクティス</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-bold">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>エラーは具体的に記述</li>
                <li>エラー発生フィールドを明示</li>
                <li>解決方法を提示</li>
                <li>成功時は視覚的フィードバック</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-bold">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>「エラーが発生しました」だけ</li>
                <li>全フィールドを赤くする</li>
                <li>エラー原因を隠す</li>
                <li>フィードバックなしで完了</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
};
