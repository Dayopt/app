/**
 * DOM を必要としない unit test（`unit` project、`environment: 'node'`）の setup。
 *
 * ここに置いてよいのは **module mock だけ**。DOM global の shim や
 * `@testing-library` 由来の処理は `setup.ts`（`unit-dom` project）側に置く。
 *
 * `setup.ts` はこのファイルを import して DOM 用の処理を足す構成なので、
 * 両 project で共有したい mock はここに 1 か所だけ書く。
 */
import type { ReactNode } from 'react';
import { vi } from 'vitest';

// server-only: テスト環境ではサーバーコンポーネント制約を無効化
vi.mock('server-only', () => ({}));

// next/navigation のモック（next-intl が内部で依存）
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  notFound: vi.fn(),
}));

// next-intl のモック
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  useMessages: () => ({}),
  useNow: () => new Date(),
  useTimeZone: () => 'UTC',
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString(),
    number: (num: number) => num.toString(),
    relativeTime: () => '',
  }),
  // テストでNextIntlClientProviderを直接使うファイル用
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}));
