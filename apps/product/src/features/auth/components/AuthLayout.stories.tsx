import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AuthLayout } from './AuthLayout';

/**
 * AuthLayout — 認証ページのレイアウトラッパー。
 *
 * ログイン・サインアップ・パスワードリセット・MFA以外の認証ページで使用。
 * 画面中央に最大幅 sm のカードを配置する。
 *
 * NOTE: ログイン・サインアップページ（/auth/login, /auth/signup 等）では
 * usePathname で判定してラップをスキップするため、このレイアウトは
 * メール確認完了・リンク期限切れ等のシンプルなページ向け。
 */
const meta = {
  title: 'Product/Features/Auth/AuthLayout',
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      navigation: {
        pathname: '/ja/auth/callback',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 標準のセンタリングレイアウト（/auth/callback 等）。カード枠 + 中央配置。 */
export const Default: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <AuthLayout>
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-foreground text-xl font-medium">メール確認完了</h1>
        <p className="text-muted-foreground text-sm">
          アカウントが確認されました。ログインしてください。
        </p>
        <button
          type="button"
          className="bg-primary text-primary-foreground mt-2 rounded-lg px-4 py-2 text-sm"
        >
          ログインへ
        </button>
      </div>
    </AuthLayout>
  ),
};

/** エラーページ。リンク期限切れなどのエラー状態。 */
export const ErrorPage: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <AuthLayout>
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-foreground text-xl font-medium">リンクの期限切れ</h1>
        <p className="text-muted-foreground text-sm">
          このリンクは既に使用されているか、有効期限が切れています。
          再度メールをリクエストしてください。
        </p>
        <button
          type="button"
          className="bg-primary text-primary-foreground mt-2 rounded-lg px-4 py-2 text-sm"
        >
          再送信
        </button>
      </div>
    </AuthLayout>
  ),
};

/**
 * ログインページ相当のパス — ラップをスキップ。
 *
 * pathname が /auth/login を含む場合、AuthLayout は children をそのまま返す
 * （カードラップなし）。独自の2カラムレイアウトを持つページ向け。
 */
export const LoginPathSkipped: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/ja/auth/login',
      },
    },
  },
  render: () => (
    <AuthLayout>
      <div className="bg-muted flex h-32 items-center justify-center rounded-lg">
        <p className="text-muted-foreground text-sm">ログインページコンテンツ（ラップなし）</p>
      </div>
    </AuthLayout>
  ),
};

/**
 * パスワード設定ページ相当のパス — ラップをスキップ（#2009 の回帰確認）。
 *
 * `/auth/reset-password` は自前で全画面センタリング wrapper（`max-w-sm`）を持つため、
 * allowlist から漏れていると AuthLayout 自身の `max-w-sm` カードに二重ネストされ、
 * カード幅が極端に狭くなる（1 行 7〜8 文字で縦折り返し）。allowlist 追加後は
 * LoginPathSkipped と同じく children がそのまま返る。
 */
export const ResetPasswordPathSkipped: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/ja/auth/reset-password',
      },
    },
  },
  render: () => (
    <div className="bg-surface-container flex min-h-svh flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-sm">
        <AuthLayout>
          <div className="bg-card rounded-lg border p-6">
            <p className="text-muted-foreground text-sm">
              パスワード設定フォーム相当（ページ自前の wrapper のみ、二重ネストなし）
            </p>
          </div>
        </AuthLayout>
      </div>
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-8 p-4">
      <section>
        <p className="text-muted-foreground mb-2 text-xs">標準レイアウト（/auth/callback）</p>
        <p className="text-muted-foreground mb-4 text-xs">
          AuthLayout は min-h-dvh の全画面配置のため、個別 Story での確認を推奨。
        </p>
        <ul className="text-muted-foreground list-disc pl-4 text-xs leading-6">
          <li>Default — メール確認完了ページ</li>
          <li>ErrorPage — リンク期限切れページ</li>
          <li>LoginPathSkipped — /auth/login パスではラップなし</li>
          <li>ResetPasswordPathSkipped — /auth/reset-password パスではラップなし（#2009）</li>
        </ul>
      </section>
    </div>
  ),
};
