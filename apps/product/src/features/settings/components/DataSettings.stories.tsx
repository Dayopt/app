/**
 * DataSettings Stories
 *
 * tRPC の user.exportData をモック（enabled: false で初期化されるため基本的にデータ不要）。
 * エクスポート・復元・MCP/API・データ削除の各セクションを表示。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { dayoptUrls } from '@dayopt/config';
import { StoryTRPCProvider } from '@dayopt/storybook/mocks/trpc';

import { DataSettings } from './DataSettings';

const PRO_OVERVIEW = {
  billingInfo: {
    subscriptionStatus: 'active',
    stripeCustomerId: 'cus_story',
    subscriptionId: 'sub_story',
  },
  paymentMethod: null,
  invoices: [],
};

const FREE_OVERVIEW = {
  billingInfo: {
    subscriptionStatus: 'free',
    stripeCustomerId: null,
    subscriptionId: null,
  },
  paymentMethod: null,
  invoices: [],
};

const CONNECTED_CLIENTS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    clientId: 'chatgpt',
    scopes: ['read:entries', 'write:plans'],
    authorizedAt: '2026-07-23T00:00:00.000Z',
    lastUsedAt: '2026-07-23T09:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    clientId: 'claude-ai',
    scopes: ['read:entries'],
    authorizedAt: '2026-07-22T00:00:00.000Z',
    lastUsedAt: null,
  },
];

function dataSettingsMocks(
  billingOverview: typeof PRO_OVERVIEW | typeof FREE_OVERVIEW,
  connections: typeof CONNECTED_CLIENTS,
) {
  return {
    'billing.getOverview': billingOverview,
    'user.listOAuthConnections': connections,
  };
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Product/Features/Settings/DataSettings',
  component: DataSettings,
  args: {
    mcpServerUrl: dayoptUrls.mcp,
  },
  parameters: {
    layout: 'padded',
    trpcMocks: dataSettingsMocks(PRO_OVERVIEW, []),
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（エクスポート・復元・MCP/API・データ削除の全セクション表示） */
export const Default: Story = {
  parameters: {
    a11y: { config: { rules: [{ id: 'button-name', enabled: false }] } },
  },
};

/** 複数のAIクライアントが接続されている状態。 */
export const ConnectedClients: Story = {
  parameters: {
    trpcMocks: dataSettingsMocks(PRO_OVERVIEW, CONNECTED_CLIENTS),
  },
};

/** Freeへ変更後も既存接続を解除できる状態。 */
export const FreeWithConnection: Story = {
  parameters: {
    trpcMocks: dataSettingsMocks(FREE_OVERVIEW, CONNECTED_CLIENTS.slice(0, 1)),
  },
};

/** OAuth surfaceを持たないPreviewで、接続追加の導線を表示しない状態。 */
export const OAuthUnavailable: Story = {
  args: {
    mcpServerUrl: null,
  },
};

/** 全ストーリーを並べて一覧表示 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { config: { rules: [{ id: 'button-name', enabled: false }] } },
  },
  render: () => (
    <div className="space-y-12">
      <StoryTRPCProvider mocks={dataSettingsMocks(PRO_OVERVIEW, [])}>
        <DataSettings mcpServerUrl={dayoptUrls.mcp} />
      </StoryTRPCProvider>
      <StoryTRPCProvider mocks={dataSettingsMocks(PRO_OVERVIEW, CONNECTED_CLIENTS)}>
        <DataSettings mcpServerUrl={dayoptUrls.mcp} />
      </StoryTRPCProvider>
      <StoryTRPCProvider mocks={dataSettingsMocks(FREE_OVERVIEW, CONNECTED_CLIENTS.slice(0, 1))}>
        <DataSettings mcpServerUrl={dayoptUrls.mcp} />
      </StoryTRPCProvider>
      <StoryTRPCProvider mocks={dataSettingsMocks(PRO_OVERVIEW, [])}>
        <DataSettings mcpServerUrl={null} />
      </StoryTRPCProvider>
    </div>
  ),
};
