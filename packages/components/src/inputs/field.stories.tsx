import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSupportText,
  Input,
} from '@dayopt/components';

const meta = {
  title: 'Components/Inputs/Field',
  component: FieldLabel,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof FieldLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col items-start gap-6">
      <div className="w-full space-y-1">
        <FieldLabel htmlFor="basic">ラベル</FieldLabel>
        <Input id="basic" placeholder="入力してください" />
      </div>

      <div className="w-full space-y-1">
        <FieldLabel htmlFor="req" required requiredLabel="必須">
          メールアドレス
        </FieldLabel>
        <Input id="req" type="email" />
      </div>

      <div className="w-full space-y-1">
        <FieldLabel htmlFor="support">タグ名</FieldLabel>
        <FieldSupportText>最大20文字まで</FieldSupportText>
        <Input id="support" />
      </div>

      <div className="w-full space-y-1">
        <FieldLabel htmlFor="err">入力項目</FieldLabel>
        <Input id="err" aria-invalid="true" defaultValue="不正な値" />
        <FieldError id="err-msg">有効な値を入力してください</FieldError>
      </div>

      <div className="w-full space-y-1">
        <FieldLabel htmlFor="desc">パスワード</FieldLabel>
        <Input id="desc" type="password" />
        <FieldDescription>8文字以上で設定してください</FieldDescription>
      </div>

      <FieldGroup className="w-full">
        <Field>
          <FieldLabel htmlFor="grp1">姓</FieldLabel>
          <Input id="grp1" />
        </Field>
        <Field>
          <FieldLabel htmlFor="grp2">名</FieldLabel>
          <Input id="grp2" />
        </Field>
      </FieldGroup>

      <FieldGroup className="w-full">
        <Field>
          <FieldLabel htmlFor="sep1">メールアドレス</FieldLabel>
          <Input id="sep1" type="email" />
        </Field>
        <FieldSeparator>または</FieldSeparator>
        <Field>
          <FieldLabel htmlFor="sep2">電話番号</FieldLabel>
          <Input id="sep2" type="tel" />
        </Field>
      </FieldGroup>
    </div>
  ),
};

/**
 * horizontal orientation - ラベルと入力を横並びにする。
 * 設定画面やフォームの密度が高い箇所に適切。
 */
export const HorizontalOrientation: Story = {
  render: () => (
    <div className="flex w-96 flex-col items-start gap-4">
      <FieldGroup className="w-full">
        <Field orientation="horizontal">
          <FieldLabel htmlFor="h-name">表示名</FieldLabel>
          <Input id="h-name" placeholder="ユーザー名を入力" />
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="h-email">メール</FieldLabel>
          <Input id="h-email" type="email" placeholder="example@email.com" />
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="h-lang">言語</FieldLabel>
          <Input id="h-lang" defaultValue="日本語" />
        </Field>
      </FieldGroup>
    </div>
  ),
};

/**
 * errorsArray - FieldErrorにerrorsプロップで複数エラーを渡すパターン。
 * react-hook-form等のバリデーション結果をまとめて表示する場合に使用。
 */
export const ErrorsArray: Story = {
  render: () => (
    <div className="flex w-80 flex-col items-start gap-6">
      <p className="text-muted-foreground text-xs">単一エラー（errorsプロップ）</p>
      <div className="w-full space-y-1">
        <FieldLabel htmlFor="single-err">パスワード</FieldLabel>
        <Input id="single-err" type="password" aria-invalid="true" />
        <FieldError errors={[{ message: '8文字以上で入力してください' }]} />
      </div>

      <p className="text-muted-foreground text-xs">複数エラー（errorsプロップ）</p>
      <div className="w-full space-y-1">
        <FieldLabel htmlFor="multi-err">パスワード</FieldLabel>
        <Input id="multi-err" type="password" aria-invalid="true" />
        <FieldError
          errors={[
            { message: '8文字以上で入力してください' },
            { message: '大文字を1文字以上含めてください' },
            { message: '数字を1文字以上含めてください' },
          ]}
        />
      </div>
    </div>
  ),
};

/**
 * optionalLabel - 任意項目を示すラベル。
 * optional + optionalLabel プロップでカスタムテキストを指定可能。
 */
export const OptionalLabel: Story = {
  render: () => (
    <div className="flex w-80 flex-col items-start gap-4">
      <div className="w-full space-y-1">
        <FieldLabel htmlFor="opt-default" optional>
          メモ
        </FieldLabel>
        <Input id="opt-default" placeholder="任意のメモ" />
      </div>

      <div className="w-full space-y-1">
        <FieldLabel htmlFor="opt-custom" optional optionalLabel="(任意)">
          備考
        </FieldLabel>
        <Input id="opt-custom" placeholder="備考を入力" />
      </div>

      <div className="w-full space-y-1">
        <FieldLabel htmlFor="req-compare" required requiredLabel="必須">
          メールアドレス
        </FieldLabel>
        <Input id="req-compare" type="email" />
      </div>
    </div>
  ),
};
