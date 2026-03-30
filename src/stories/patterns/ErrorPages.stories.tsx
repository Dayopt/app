import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * エラーページ & エラーバウンダリのフォールバックUI一覧
 *
 * 実コンポーネントは Radix UI / next/image / useTranslations 等に依存するため、
 * Storybook ではビジュアルモックで表示。
 *
 * 整理後のエラーシステム（6コンポーネント）:
 * - global-error.tsx: Root Layout 破壊時（Sentry + カード型）
 * - error.tsx: ルートエラー（Sentry + カード型）
 * - not-found.tsx: 404（シンプルテキスト + Go Home）
 * - calendar/error.tsx: カレンダー SSR エラー（i18n + リトライ）
 * - error-boundary.tsx: React レンダリングエラー
 * - maintenance/route.ts: メンテナンス（静的 HTML）
 */
const meta = {
  title: 'Patterns/ErrorPages',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs', 'docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Shared UI parts (mock versions without Radix / next dependencies)
// ---------------------------------------------------------------------------

function MockButton({
  children,
  variant = 'primary',
  className = '',
}: {
  children: ReactNode;
  variant?: 'primary' | 'outline';
  className?: string;
}) {
  return (
    <button
      className={
        variant === 'primary'
          ? `bg-primary text-primary-foreground hover:bg-primary-hover rounded-md px-4 py-2 text-sm font-medium ${className}`
          : `border-border text-foreground hover:bg-state-hover rounded-md border px-4 py-2 text-sm font-medium ${className}`
      }
    >
      {children}
    </button>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="bg-surface-container border-border border-b px-6 py-3">
        <h3 className="text-foreground text-sm font-bold">{title}</h3>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock: Page-level errors (card design, matching global-error.tsx)
// ---------------------------------------------------------------------------

/** src/app/error.tsx 相当 — カード型 + Sentry連携 */
function MockRootError({ errorMessage }: { errorMessage: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="bg-card border-border-subtle w-full max-w-md rounded-2xl border p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-destructive mb-2 text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground">
            We apologize for the inconvenience. An unexpected error occurred.
          </p>
        </div>
        <details className="mb-6">
          <summary className="text-muted-foreground hover:bg-state-hover -mx-1 cursor-pointer rounded px-1 text-sm transition-colors">
            Show details
          </summary>
          <div className="bg-surface-container mt-4 rounded p-4">
            <p className="mb-2 text-xs font-bold">Error</p>
            <pre className="text-muted-foreground max-h-40 overflow-auto text-xs">
              {errorMessage}
            </pre>
          </div>
        </details>
        <div className="space-y-4">
          <MockButton className="w-full">Try again</MockButton>
          <MockButton variant="outline" className="w-full">
            Go to Home
          </MockButton>
        </div>
        <p className="text-muted-foreground mt-6 text-center text-xs">
          This error has been automatically reported.
        </p>
      </div>
    </div>
  );
}

/** src/app/[locale]/(app)/error.tsx 相当 — App内ページエラー（i18n対応、BaseLayout内に表示） */
function MockAppError({ errorMessage }: { errorMessage: string }) {
  return (
    <div className="grid min-h-[60vh] w-full place-items-center p-8">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="border-destructive flex size-16 items-center justify-center rounded-full border-2">
          <AlertCircle className="text-destructive size-8" />
        </div>
        <div>
          <h2 className="mb-2 text-xl font-bold">Application Error</h2>
          <p className="text-muted-foreground text-sm">
            We&apos;re sorry. An unexpected problem has occurred.
          </p>
          <div className="border-border bg-surface-container mt-4 rounded-lg border p-4 text-left">
            <p className="text-destructive font-mono text-xs">{errorMessage}</p>
          </div>
        </div>
        <div className="flex gap-4">
          <MockButton>Retry</MockButton>
          <MockButton variant="outline">Go Home</MockButton>
        </div>
        <p className="text-muted-foreground text-xs">The error has been automatically reported</p>
      </div>
    </div>
  );
}

/** src/app/[locale]/(app)/calendar/error.tsx 相当 — i18n対応 */
function MockCalendarError({ errorMessage }: { errorMessage: string }) {
  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <div className="border-destructive flex size-16 items-center justify-center rounded-full border-2">
        <AlertCircle className="text-destructive size-8" />
      </div>
      <div className="text-center">
        <h2 className="mb-2 text-xl font-bold">Failed to load calendar</h2>
        <p className="text-muted-foreground text-sm">
          Please check your network connection and try again.
        </p>
        <div className="border-border bg-surface-container mt-4 rounded-lg border p-4 text-left">
          <p className="text-destructive font-mono text-xs">{errorMessage}</p>
        </div>
      </div>
      <div className="flex gap-4">
        <MockButton>Retry</MockButton>
        <MockButton variant="outline">Reload page</MockButton>
      </div>
    </div>
  );
}

/** src/app/not-found.tsx 相当 — カード型、シンプル */
function MockNotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="bg-card border-border-subtle w-full max-w-md rounded-2xl border p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-foreground mb-2 text-2xl font-bold">Page not found</h1>
          <p className="text-muted-foreground">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>
        <MockButton className="w-full">Go to Home</MockButton>
      </div>
    </div>
  );
}

/** src/app/maintenance/route.ts 相当 — 静的HTML、Providerバイパス */
function MockMaintenance() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="bg-card border-border-subtle w-full max-w-[28rem] rounded-lg border p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <div className="bg-muted flex size-16 items-center justify-center rounded-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground size-8"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />
            </svg>
          </div>
        </div>
        <div className="mb-6 text-center">
          <h1 className="text-foreground mb-2 text-2xl font-bold">Under Maintenance</h1>
        </div>
        <div className="bg-muted mb-6 rounded p-4">
          <p className="text-foreground mb-2 text-sm">
            We&apos;re currently performing system maintenance.
          </p>
          <p className="text-muted-foreground text-xs">Please check back shortly.</p>
        </div>
        <p className="text-muted-foreground text-center text-xs">
          We apologize for the inconvenience.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock: ErrorBoundary fallbacks
// ---------------------------------------------------------------------------

/** ErrorBoundary のデフォルトフォールバック（本番環境用） */
function MockDefaultFallback() {
  return (
    <div className="border-destructive bg-surface-container rounded-2xl border p-6">
      <div className="text-center">
        <div className="text-destructive mb-4 text-6xl">&#9888;&#65039;</div>
        <h2 className="text-destructive mb-2 text-3xl font-bold tracking-tight">
          An unexpected error occurred
        </h2>
        <p className="text-foreground mb-4">
          We&apos;re sorry. An error occurred in the application.
          <br />
          An error report will be sent automatically.
        </p>
        <div className="flex justify-center gap-2">
          <button className="bg-primary text-primary-foreground hover:bg-primary-hover rounded px-4 py-2 transition-colors">
            Retry
          </button>
          <button className="bg-surface-container text-muted-foreground hover:bg-state-hover rounded px-4 py-2 transition-colors">
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}

/** 開発環境用フォールバック */
function MockDevFallback({ componentName }: { componentName?: string }) {
  return (
    <div className="border-border bg-surface-container rounded-2xl border p-6">
      <h3 className="text-foreground mb-2 text-2xl font-bold tracking-tight">
        Development - Component Error
      </h3>
      <p className="text-foreground mb-2">Component: {componentName || 'Unknown'}</p>
      <p className="text-muted-foreground text-sm">Check the browser console for details.</p>
    </div>
  );
}

/** 機能エラー用フォールバック */
function MockFeatureFallback({ featureName }: { featureName: string }) {
  return (
    <div className="border-border bg-surface-container rounded border p-4">
      <p className="text-foreground text-center">An error occurred in the {featureName} feature</p>
      <button className="bg-primary text-primary-foreground hover:bg-primary-hover mx-auto mt-2 block rounded px-4 py-1 text-sm transition-colors">
        Reload Page
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/** エラー表示パターンの使い分けガイド */
export const Overview: Story = {
  render: () => (
    <div className="p-6">
      <h1 className="text-foreground mb-2 text-2xl font-bold">エラーページ & エラーバウンダリ</h1>
      <p className="text-muted-foreground mb-8">
        アプリケーション内のエラー表示パターン一覧。Next.js App Router の error.tsx / not-found.tsx
        と、React ErrorBoundary のフォールバックUI。7コンポーネント構成。
      </p>

      <div className="bg-card border-border mb-8 rounded-xl border p-6">
        <h2 className="mb-4 text-lg font-bold">ページレベルエラー</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Next.js App Router の error.tsx /
          not-found.tsx。SSRエラー時やルーティング不正時に自動表示。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="py-3 pr-4 text-left font-bold">コンポーネント</th>
                <th className="py-3 pr-4 text-left font-bold">ファイル</th>
                <th className="py-3 pr-4 text-left font-bold">発動条件</th>
                <th className="py-3 text-left font-bold">i18n</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-border border-b">
                <td className="py-3 pr-4 font-medium">GlobalError</td>
                <td className="py-3 pr-4 font-mono text-xs">src/app/global-error.tsx</td>
                <td className="py-3 pr-4">Root Layout破壊時</td>
                <td className="py-3">なし（英語固定）</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3 pr-4 font-medium">RootError</td>
                <td className="py-3 pr-4 font-mono text-xs">src/app/error.tsx</td>
                <td className="py-3 pr-4">Provider外のランタイムエラー</td>
                <td className="py-3">なし（英語固定）</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3 pr-4 font-medium">NotFound</td>
                <td className="py-3 pr-4 font-mono text-xs">src/app/not-found.tsx</td>
                <td className="py-3 pr-4">存在しないルートへのアクセス</td>
                <td className="py-3">なし（英語固定）</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3 pr-4 font-medium">AppError</td>
                <td className="py-3 pr-4 font-mono text-xs">src/app/.../(app)/error.tsx</td>
                <td className="py-3 pr-4">App内ページエラー（BaseLayout内に表示）</td>
                <td className="py-3">あり（next-intl）</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3 pr-4 font-medium">CalendarError</td>
                <td className="py-3 pr-4 font-mono text-xs">src/app/.../calendar/error.tsx</td>
                <td className="py-3 pr-4">カレンダーSSR/ランタイムエラー</td>
                <td className="py-3">あり（next-intl）</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3 pr-4 font-medium">Maintenance</td>
                <td className="py-3 pr-4 font-mono text-xs">src/app/maintenance/route.ts</td>
                <td className="py-3 pr-4">システムメンテナンス中（503）</td>
                <td className="py-3">なし（英語固定）</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border-border rounded-xl border p-6">
        <h2 className="mb-4 text-lg font-bold">ErrorBoundary フォールバック</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          React ErrorBoundary がキャッチしたエラー時のフォールバックUI。Sentry連携で自動レポート。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="py-3 pr-4 text-left font-bold">コンポーネント</th>
                <th className="py-3 pr-4 text-left font-bold">使用元</th>
                <th className="py-3 text-left font-bold">用途</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-border border-b">
                <td className="py-3 pr-4 font-medium">DefaultErrorFallback</td>
                <td className="py-3 pr-4">ErrorBoundary</td>
                <td className="py-3">本番環境のデフォルト表示</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3 pr-4 font-medium">DevErrorFallback</td>
                <td className="py-3 pr-4">DetailedErrorBoundary</td>
                <td className="py-3">開発環境用（コンポーネント名表示）</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3 pr-4 font-medium">FeatureErrorFallback</td>
                <td className="py-3 pr-4">FeatureErrorBoundary</td>
                <td className="py-3">機能単位のエラー表示</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Page-level error stories
// ---------------------------------------------------------------------------

/** ルートレベルエラーページ。カード型 + Sentry連携。Providersの外で動作。 */
export const RootError: Story = {
  render: () => <MockRootError errorMessage="Failed to fetch data from server" />,
};

/** App内ページエラー。BaseLayout内に表示。i18n対応。 */
export const AppError: Story = {
  render: () => <MockAppError errorMessage="Failed to load page data" />,
};

/** カレンダーページ専用エラー。i18n対応。dev環境ではエラーメッセージも表示。 */
export const CalendarError: Story = {
  render: () => <MockCalendarError errorMessage="Failed to fetch calendar events" />,
};

/** ルートレベル404ページ。カード型のシンプルデザイン。 */
export const NotFound: Story = {
  render: () => <MockNotFound />,
};

/** メンテナンスページ。静的HTML、Providerバイパス。503 + Retry-After。 */
export const Maintenance: Story = {
  render: () => <MockMaintenance />,
};

// ---------------------------------------------------------------------------
// ErrorBoundary fallback stories
// ---------------------------------------------------------------------------

/** ErrorBoundary のデフォルトフォールバックUI。本番環境で表示される。 */
export const BoundaryDefault: Story = {
  render: () => (
    <div className="p-8">
      <MockDefaultFallback />
    </div>
  ),
};

/** 特定機能用のフォールバックUI。featureName を変えて複数パターン表示。 */
export const BoundaryFeature: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-8">
      <MockFeatureFallback featureName="Calendar" />
      <MockFeatureFallback featureName="Stats" />
      <MockFeatureFallback featureName="Tags" />
    </div>
  ),
};

/** 開発環境用フォールバックUI。コンポーネント名の表示パターン。 */
export const BoundaryDev: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-8">
      <MockDevFallback componentName="CalendarGrid" />
      <MockDevFallback />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Catalog stories
// ---------------------------------------------------------------------------

/** 全エラーバウンダリフォールバック一覧 */
export const AllBoundaries: Story = {
  render: () => (
    <div className="flex flex-col gap-8 p-8">
      <Section title="DefaultErrorFallback" description="ErrorBoundary の本番デフォルト表示">
        <div className="p-6">
          <MockDefaultFallback />
        </div>
      </Section>
      <Section title="FeatureErrorFallback" description="機能単位のエラー（feature名を動的表示）">
        <div className="flex flex-col gap-4 p-6">
          <MockFeatureFallback featureName="Calendar" />
          <MockFeatureFallback featureName="Stats" />
        </div>
      </Section>
      <Section title="DevErrorFallback" description="開発環境用（コンポーネント名表示）">
        <div className="flex flex-col gap-4 p-6">
          <MockDevFallback componentName="CalendarGrid" />
          <MockDevFallback />
        </div>
      </Section>
    </div>
  ),
};

/** 全ページレベルエラー一覧 */
export const AllPages: Story = {
  render: () => (
    <div className="flex flex-col">
      <Section title="Root Error" description="カード型 + Sentry連携（src/app/error.tsx）">
        <MockRootError errorMessage="Failed to fetch" />
      </Section>
      <Section title="App Error" description="BaseLayout内に表示（src/app/.../(app)/error.tsx）">
        <MockAppError errorMessage="Failed to load page data" />
      </Section>
      <Section
        title="Calendar Error"
        description="i18n対応 + リトライ（src/app/.../calendar/error.tsx）"
      >
        <MockCalendarError errorMessage="Network timeout" />
      </Section>
      <Section
        title="404 Not Found"
        description="カード型、ホームへの導線のみ（src/app/not-found.tsx）"
      >
        <MockNotFound />
      </Section>
      <Section
        title="Maintenance"
        description="静的HTML、503 + Retry-After（src/app/maintenance/route.ts）"
      >
        <MockMaintenance />
      </Section>
    </div>
  ),
};
