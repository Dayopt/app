/**
 * BillingSettings Stories
 *
 * tRPC の billing.getInfo をモックして各プラン状態を再現する。
 * STRIPE_PRICE_ID は process.env からビルド時に埋め込まれるため、
 * Storybook の env 設定で NEXT_PUBLIC_STRIPE_PRO_PRICE_ID を制御。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import type { BillingInfo } from '../server/billing-service';

import { BillingSettings } from './billing-settings';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const FREE_BILLING_INFO: BillingInfo = {
  subscriptionStatus: 'free',
  stripeCustomerId: null,
  subscriptionId: null,
};

const PRO_BILLING_INFO: BillingInfo = {
  subscriptionStatus: 'active',
  stripeCustomerId: 'cus_mock_123',
  subscriptionId: 'sub_mock_456',
};

const TRIALING_BILLING_INFO: BillingInfo = {
  subscriptionStatus: 'trialing',
  stripeCustomerId: 'cus_mock_789',
  subscriptionId: 'sub_mock_trial',
};

// ─────────────────────────────────────────────────────────
// tRPC Mock Helpers
// ─────────────────────────────────────────────────────────

/** billing.getInfo に固定データを返す tRPC リンクを生成 */
function createBillingMockLink(billingData: BillingInfo | undefined): TRPCLink<AppRouter> {
  return () => {
    return ({ op }) =>
      observable((observer) => {
        if (op.type === 'query' && op.path === 'billing.getInfo') {
          observer.next({ result: { type: 'data', data: billingData } });
        } else if (op.type === 'query') {
          observer.next({ result: { type: 'data', data: undefined } });
        }
        // mutation は即座に完了（window.location.href への遷移を防ぐ）
        observer.complete();
      });
  };
}

/** ローディング状態を再現する（レスポンスを返さない）tRPC リンク */
function createPendingLink(): TRPCLink<AppRouter> {
  return () => {
    return () =>
      observable(() => {
        // observer.next / observer.complete を呼ばないことでローディングを維持
      });
  };
}

interface BillingMockProviderProps {
  children: ReactNode;
  billingData?: BillingInfo;
  pending?: boolean;
}

function BillingMockProvider({ children, billingData, pending }: BillingMockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const link = pending
    ? createPendingLink()
    : createBillingMockLink(billingData ?? FREE_BILLING_INFO);
  const trpcClient = api.createClient({ links: [link] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/BillingSettings',
  component: BillingSettings,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BillingSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 無料プランユーザー（デフォルト状態） */
export const FreePlan: Story = {
  decorators: [
    (Story) => (
      <BillingMockProvider billingData={FREE_BILLING_INFO}>
        <Story />
      </BillingMockProvider>
    ),
  ],
};

/** Proプラン（active）ユーザー。支払い方法・請求履歴セクションも表示される */
export const ProPlan: Story = {
  decorators: [
    (Story) => (
      <BillingMockProvider billingData={PRO_BILLING_INFO}>
        <Story />
      </BillingMockProvider>
    ),
  ],
};

/** トライアル中ユーザー（trialing） */
export const TrialingPlan: Story = {
  decorators: [
    (Story) => (
      <BillingMockProvider billingData={TRIALING_BILLING_INFO}>
        <Story />
      </BillingMockProvider>
    ),
  ],
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <BillingMockProvider pending>
        <Story />
      </BillingMockProvider>
    ),
  ],
};

/**
 * STRIPE_PRICE_ID が未設定でアップグレードボタンが disabled になる状態。
 *
 * 注意: NEXT_PUBLIC_STRIPE_PRO_PRICE_ID はビルド時に process.env から埋め込まれるため、
 * Storybook 上では .env.storybook で空にするか、ビルド設定で制御する。
 * デフォルトの Storybook 環境では未設定（空文字）のため、このストーリーは
 * 自動的に disabled 状態を表示する。
 */
export const StripeNotConfigured: Story = {
  decorators: [
    (Story) => (
      <BillingMockProvider billingData={FREE_BILLING_INFO}>
        <Story />
      </BillingMockProvider>
    ),
  ],
};
