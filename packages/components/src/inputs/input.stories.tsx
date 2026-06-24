import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { Field, FieldError, FieldLabel, Input } from '@dayopt/components';

const meta = {
  title: 'Components/Inputs/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    const [showPassword, setShowPassword] = useState(false);
    return (
      <div className="flex flex-col items-start gap-6">
        <div className="w-80 space-y-4">
          <Input size="sm" placeholder="フィルター入力" aria-label="Filter input" />
          <Input placeholder="標準入力" aria-label="Standard input" />
          <Input size="lg" placeholder="検索バー" aria-label="Search bar" />
        </div>

        <div className="w-80 space-y-4">
          <Input type="text" placeholder="テキスト入力" aria-label="Text input" />
          <Input
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            aria-label="Email"
          />
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="パスワード"
              className="pr-8"
              autoComplete="current-password"
              aria-label="Password"
            />
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-4 -translate-y-1/2"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
            >
              {showPassword ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </button>
          </div>
        </div>

        <div className="w-80 space-y-4">
          <Input placeholder="通常" aria-label="Normal input" />
          <Input placeholder="無効" disabled aria-label="Disabled input" />
          <Input placeholder="エラー状態" aria-invalid="true" aria-label="Error input" />
        </div>

        <div className="w-80 space-y-4">
          <Field>
            <FieldLabel htmlFor="email-error">メールアドレス</FieldLabel>
            <Input
              id="email-error"
              type="email"
              placeholder="you@example.com"
              aria-invalid="true"
              aria-describedby="email-error-text"
            />
            <FieldError id="email-error-text">有効なメールアドレスを入力してください</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="password-error">パスワード</FieldLabel>
            <Input
              id="password-error"
              type="password"
              aria-invalid="true"
              aria-describedby="password-error-text"
            />
            <FieldError id="password-error-text">
              パスワードは8文字以上で入力してください
            </FieldError>
          </Field>
        </div>
      </div>
    );
  },
};
