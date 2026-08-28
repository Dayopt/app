import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const portalMutate = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const mutationOptions = vi.hoisted(
  () =>
    ({ current: null }) as {
      current: null | {
        onError: (error: unknown, variables: { operationId: string }) => void;
        onSuccess: (
          data: { url: string },
          variables: { operationId: string },
        ) => Promise<void> | void;
      };
    },
);

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/toast', () => ({
  toast: { error: toastError },
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    billing: {
      createPortalSession: {
        useMutation: (options: NonNullable<typeof mutationOptions.current>) => {
          mutationOptions.current = options;
          return {
            isPending: false,
            mutate: portalMutate,
          };
        },
      },
    },
  },
}));

vi.mock('@dayopt/components', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

import { PaymentErrorDialog } from './PaymentErrorDialog';

const FIRST_OPERATION_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_OPERATION_ID = '00000000-0000-4000-8000-000000000002';

describe('PaymentErrorDialog billing operation', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(FIRST_OPERATION_ID)
      .mockReturnValueOnce(SECOND_OPERATION_ID);
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('keeps the dialog open and reuses the operation ID after a retryable error', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PaymentErrorDialog open onClose={onClose} />);

    const checkPayment = screen.getByRole('button', {
      name: 'common.paymentError.checkPayment',
    });
    await user.click(checkPayment);
    expect(portalMutate).toHaveBeenCalledWith({ operationId: FIRST_OPERATION_ID });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      mutationOptions.current?.onError(
        { data: { serviceCode: 'BILLING_OPERATION_CONFLICT' } },
        { operationId: FIRST_OPERATION_ID },
      );
    });
    expect(onClose).not.toHaveBeenCalled();

    await user.click(checkPayment);
    expect(portalMutate).toHaveBeenLastCalledWith({ operationId: FIRST_OPERATION_ID });
    expect(crypto.randomUUID).toHaveBeenCalledOnce();
  });

  it('persists close before redirect and ignores synchronous double-clicks', async () => {
    const user = userEvent.setup();
    let resolveClose: (() => void) | undefined;
    const onClose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveClose = resolve;
        }),
    );
    render(<PaymentErrorDialog open onClose={onClose} />);

    const checkPayment = screen.getByRole('button', {
      name: 'common.paymentError.checkPayment',
    });
    await user.dblClick(checkPayment);
    expect(portalMutate).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    let success: Promise<void> | void;
    act(() => {
      success = mutationOptions.current?.onSuccess(
        { url: '#portal' },
        { operationId: FIRST_OPERATION_ID },
      );
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('');

    await act(async () => {
      resolveClose?.();
      await success;
    });
    expect(window.location.hash).toBe('#portal');
  });

  it('keeps Later enabled after account deletion closes Portal actions', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PaymentErrorDialog open onClose={onClose} />);

    const checkPayment = screen.getByRole('button', {
      name: 'common.paymentError.checkPayment',
    });
    const later = screen.getByRole('button', {
      name: 'common.paymentError.later',
    });
    await user.click(checkPayment);

    act(() => {
      mutationOptions.current?.onError(
        { data: { serviceCode: 'BILLING_ACCOUNT_CLOSING' } },
        { operationId: FIRST_OPERATION_ID },
      );
    });

    expect(checkPayment).toBeDisabled();
    expect(later).toBeEnabled();
    await user.click(later);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('discards a terminal operation ID before the next explicit click', async () => {
    const user = userEvent.setup();
    render(<PaymentErrorDialog open onClose={vi.fn()} />);

    const checkPayment = screen.getByRole('button', {
      name: 'common.paymentError.checkPayment',
    });
    await user.click(checkPayment);
    act(() => {
      mutationOptions.current?.onError(
        { data: { serviceCode: 'BILLING_RESPONSE_EXPIRED' } },
        { operationId: FIRST_OPERATION_ID },
      );
    });
    await user.click(checkPayment);

    expect(portalMutate).toHaveBeenLastCalledWith({ operationId: SECOND_OPERATION_ID });
    expect(toastError).toHaveBeenCalledWith('common.billingOperation.restart');
  });
});
