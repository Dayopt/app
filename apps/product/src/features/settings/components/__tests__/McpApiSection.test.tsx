import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateConnections = vi.hoisted(() => vi.fn());
const mutateAsync = vi.hoisted(() => vi.fn());
const listOAuthConnections = vi.hoisted(() => vi.fn());
const billingOverview = vi.hoisted(() => vi.fn());

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('@/components/ui/overlays/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    confirmLabel,
  }: {
    open: boolean;
    onConfirm: () => Promise<void>;
    confirmLabel: string;
  }) =>
    open ? (
      <button data-testid="confirm-disconnect" onClick={onConfirm}>
        {confirmLabel}
      </button>
    ) : null,
}));

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    useUtils: () => ({
      user: { listOAuthConnections: { invalidate: invalidateConnections } },
    }),
    billing: { getOverview: { useQuery: billingOverview } },
    user: {
      listOAuthConnections: { useQuery: listOAuthConnections },
      revokeOAuthConnection: {
        useMutation: (options: { onSuccess: () => Promise<void> }) => ({
          isPending: false,
          mutateAsync: async (input: { connectionId: string }) => {
            await mutateAsync(input);
            await options.onSuccess();
          },
        }),
      },
    },
  },
}));

import { McpApiSection } from '../DataSettings';

const connectionId = '00000000-0000-4000-8000-000000000001';
const secondConnectionId = '00000000-0000-4000-8000-000000000002';

describe('McpApiSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    billingOverview.mockReturnValue({
      data: {
        billingInfo: {
          subscriptionStatus: 'free',
          stripeCustomerId: null,
          subscriptionId: null,
        },
      },
    });
    listOAuthConnections.mockReturnValue({
      data: [
        {
          id: connectionId,
          clientId: 'chatgpt',
          scopes: ['read:entries'],
          authorizedAt: '2026-07-23T00:00:00.000Z',
          lastUsedAt: null,
        },
        {
          id: secondConnectionId,
          clientId: 'chatgpt',
          scopes: ['read:entries', 'write:plans'],
          authorizedAt: '2026-07-22T00:00:00.000Z',
          lastUsedAt: '2026-07-23T01:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mutateAsync.mockResolvedValue({ success: true });
    invalidateConnections.mockResolvedValue(undefined);
  });

  it('Freeでも同じclientの接続を別々に表示し、選択したconnectionだけを失効する', async () => {
    const user = userEvent.setup();
    render(<McpApiSection />);

    expect(screen.getAllByText('ChatGPT')).toHaveLength(2);
    expect(screen.getByText('settings.dataControls.mcp.proRequired')).toBeInTheDocument();

    const disconnectButtons = screen.getAllByRole('button', {
      name: 'settings.dataControls.mcp.disconnect',
    });
    await user.click(disconnectButtons[1]!);
    await user.click(screen.getByTestId('confirm-disconnect'));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledOnce();
      expect(mutateAsync).toHaveBeenCalledWith({ connectionId: secondConnectionId });
      expect(invalidateConnections).toHaveBeenCalledOnce();
    });
  });
});
