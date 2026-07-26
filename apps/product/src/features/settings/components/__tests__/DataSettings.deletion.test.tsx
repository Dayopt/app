import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteAllData = vi.hoisted(() => vi.fn());
const prepareDeleteAllData = vi.hoisted(() => vi.fn());

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (key === 'confirmKeyword') return 'DELETE';
    return namespace ? `${namespace}.${key}` : key;
  },
}));

vi.mock('@/components/ui/overlays/confirm-dialog', () => ({
  ConfirmDialog: ({
    children,
    confirmDisabled,
    onConfirm,
    open,
  }: {
    children?: React.ReactNode;
    confirmDisabled?: boolean;
    onConfirm: () => Promise<void>;
    open: boolean;
  }) =>
    open ? (
      <div role="dialog">
        {children}
        <button
          data-testid="confirm-dialog-confirm"
          disabled={confirmDisabled}
          onClick={() => void onConfirm().catch(() => undefined)}
        >
          confirm
        </button>
      </div>
    ) : null,
}));

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    useUtils: () => ({
      user: { listOAuthConnections: { invalidate: vi.fn() } },
    }),
    billing: {
      getOverview: {
        useQuery: () => ({
          data: {
            billingInfo: {
              stripeCustomerId: null,
              subscriptionId: null,
              subscriptionStatus: 'free',
            },
          },
        }),
      },
    },
    user: {
      deleteAllData: {
        useMutation: (options: { onError: () => void; onSuccess: () => void }) => ({
          isPending: false,
          mutateAsync: async (input: unknown) => {
            try {
              const result = await deleteAllData(input);
              options.onSuccess();
              return result;
            } catch (error) {
              options.onError();
              throw error;
            }
          },
        }),
      },
      deleteBlocks: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: vi.fn(),
        }),
      },
      exportData: {
        useQuery: () => ({
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      listOAuthConnections: {
        useQuery: () => ({
          data: [],
          isError: false,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      prepareDeleteAllData: {
        useMutation: (options: { onError: () => void }) => ({
          isPending: false,
          mutateAsync: async () => {
            try {
              return await prepareDeleteAllData();
            } catch (error) {
              options.onError();
              throw error;
            }
          },
        }),
      },
      revokeOAuthConnection: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: vi.fn(),
        }),
      },
    },
  },
}));

import { DataSettings } from '../DataSettings';

const operation = {
  expectedGeneration: 7,
  operationId: '00000000-0000-4000-8000-000000000001',
};

describe('DataSettings deletion retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareDeleteAllData.mockResolvedValue(operation);
    deleteAllData
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ success: true });
  });

  it('同じdialogの手動retryでDB発行operationとgenerationを保持する', async () => {
    const user = userEvent.setup();
    render(<DataSettings />);

    await user.click(
      screen.getByRole('button', {
        name: 'settings.dataControls.deletion.deleteAllData',
      }),
    );
    await user.type(screen.getByRole('textbox'), 'DELETE');

    const confirm = screen.getByTestId('confirm-dialog-confirm');
    await user.click(confirm);

    await waitFor(() => {
      expect(deleteAllData).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(deleteAllData).toHaveBeenCalledTimes(2);
    });
    expect(prepareDeleteAllData).toHaveBeenCalledOnce();
    expect(deleteAllData.mock.calls).toEqual([
      [
        {
          confirmText: 'DELETE',
          expectedGeneration: operation.expectedGeneration,
          operationId: operation.operationId,
        },
      ],
      [
        {
          confirmText: 'DELETE',
          expectedGeneration: operation.expectedGeneration,
          operationId: operation.operationId,
        },
      ],
    ]);
  });
});
