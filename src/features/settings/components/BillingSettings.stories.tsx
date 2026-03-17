/**
 * BillingSettings Stories
 *
 * tRPC の billing.getOverview をモックして各プラン状態を再現する。
 * STRIPE_PRICE_ID は process.env からビルド時に埋め込まれるため、
 * Storybook の env 設定で NEXT_PUBLIC_STRIPE_PRO_PRICE_ID を制御。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import type {
  BillingInfo,
  BillingOverview,
  InvoiceItem,
  PaymentMethod,
} from '../server/billing-service';

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

const MOCK_PAYMENT_METHOD: PaymentMethod = {
  brand: 'visa',
  last4: '4242',
  expMonth: 12,
  expYear: 2028,
};

const MOCK_INVOICES: InvoiceItem[] = [
  {
    id: 'inv_001',
    date: '2026-03-01T00:00:00.000Z',
    amount: 500,
    currency: 'usd',
    status: 'paid',
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/mock_001',
  },
  {
    id: 'inv_002',
    date: '2026-02-01T00:00:00.000Z',
    amount: 500,
    currency: 'usd',
    status: 'paid',
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/mock_002',
  },
  {
    id: 'inv_003',
    date: '2026-01-01T00:00:00.000Z',
    amount: 500,
    currency: 'usd',
    status: 'paid',
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/mock_003',
  },
];

const MOCK_INVOICES_JPY: InvoiceItem[] = [
  {
    id: 'inv_jpy_001',
    date: '2026-03-01T00:00:00.000Z',
    amount: 55000,
    currency: 'jpy',
    status: 'paid',
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/mock_jpy_001',
  },
  {
    id: 'inv_jpy_002',
    date: '2026-02-01T00:00:00.000Z',
    amount: 55000,
    currency: 'jpy',
    status: 'paid',
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/mock_jpy_002',
  },
];

// ─────────────────────────────────────────────────────────
// tRPC Mock Helpers
// ─────────────────────────────────────────────────────────

interface MockOverviewData {
  billingInfo: BillingInfo;
  paymentMethod?: PaymentMethod | null;
  invoices?: InvoiceItem[];
}

/** billing.getOverview に固定データを返す tRPC リンクを生成 */
function createBillingMockLink(data: MockOverviewData): TRPCLink<AppRouter> {
  return () => {
    return ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const overview: BillingOverview = {
            billingInfo: data.billingInfo,
            paymentMethod: data.paymentMethod ?? null,
            invoices: data.invoices ?? [],
          };
          const responseMap: Record<string, unknown> = {
            'billing.getOverview': overview,
            'billing.getInfo': data.billingInfo,
            'billing.getPaymentMethod': data.paymentMethod ?? null,
            'billing.getInvoices': data.invoices ?? [],
          };
          const result = op.path in responseMap ? responseMap[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
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

/** エラー状態を再現する tRPC リンク */
function createErrorLink(): TRPCLink<AppRouter> {
  return () => {
    return ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          observer.error(TRPCClientError.from(new Error('Failed to fetch billing information')));
        }
        observer.complete();
      });
  };
}

interface BillingMockProviderProps {
  children: ReactNode;
  mockData?: MockOverviewData;
  pending?: boolean;
  error?: boolean;
}

function BillingMockProvider({ children, mockData, pending, error }: BillingMockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  let link: TRPCLink<AppRouter>;
  if (pending) {
    link = createPendingLink();
  } else if (error) {
    link = createErrorLink();
  } else {
    link = createBillingMockLink(mockData ?? { billingInfo: FREE_BILLING_INFO });
  }
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
      <BillingMockProvider mockData={{ billingInfo: FREE_BILLING_INFO }}>
        <Story />
      </BillingMockProvider>
    ),
  ],
};

/** Proプラン（active）ユーザー。支払い方法・請求履歴・キャンセルセクション表示 */
export const ProPlan: Story = {
  decorators: [
    (Story) => (
      <BillingMockProvider
        mockData={{
          billingInfo: PRO_BILLING_INFO,
          paymentMethod: MOCK_PAYMENT_METHOD,
          invoices: MOCK_INVOICES,
        }}
      >
        <Story />
      </BillingMockProvider>
    ),
  ],
};

/** トライアル中ユーザー（trialing）。カード情報・請求履歴なし */
export const TrialingPlan: Story = {
  decorators: [
    (Story) => (
      <BillingMockProvider
        mockData={{
          billingInfo: TRIALING_BILLING_INFO,
          paymentMethod: null,
          invoices: [],
        }}
      >
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

/** エラー状態（リトライボタン表示） */
export const ErrorState: Story = {
  decorators: [
    (Story) => (
      <BillingMockProvider error>
        <Story />
      </BillingMockProvider>
    ),
  ],
};

/** Proプランだが請求書がまだない状態 */
export const ProNoInvoices: Story = {
  decorators: [
    (Story) => (
      <BillingMockProvider
        mockData={{
          billingInfo: PRO_BILLING_INFO,
          paymentMethod: MOCK_PAYMENT_METHOD,
          invoices: [],
        }}
      >
        <Story />
      </BillingMockProvider>
    ),
  ],
};

/** 日本円（JPY）での請求履歴 */
export const JpyCurrency: Story = {
  decorators: [
    (Story) => (
      <BillingMockProvider
        mockData={{
          billingInfo: PRO_BILLING_INFO,
          paymentMethod: MOCK_PAYMENT_METHOD,
          invoices: MOCK_INVOICES_JPY,
        }}
      >
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
      <BillingMockProvider mockData={{ billingInfo: FREE_BILLING_INFO }}>
        <Story />
      </BillingMockProvider>
    ),
  ],
};
