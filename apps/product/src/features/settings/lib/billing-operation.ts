const BILLING_OPERATION_SERVICE_CODES = {
  accountClosing: 'BILLING_ACCOUNT_CLOSING',
  checkoutNotAvailable: 'BILLING_CHECKOUT_NOT_AVAILABLE',
  operationConflict: 'BILLING_OPERATION_CONFLICT',
  operationInvalidated: 'BILLING_OPERATION_INVALIDATED',
  recoveryExhausted: 'BILLING_RECOVERY_EXHAUSTED',
  responseExpired: 'BILLING_RESPONSE_EXPIRED',
} as const;

type BillingOperationErrorDisposition = 'account_closing' | 'retryable' | 'terminal';

function getBillingOperationServiceCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('data' in error)) return null;

  const data = error.data;
  if (!data || typeof data !== 'object' || !('serviceCode' in data)) return null;

  return typeof data.serviceCode === 'string' ? data.serviceCode : null;
}

function getBillingOperationErrorDisposition(error: unknown): BillingOperationErrorDisposition {
  const serviceCode = getBillingOperationServiceCode(error);

  if (serviceCode === BILLING_OPERATION_SERVICE_CODES.accountClosing) {
    return 'account_closing';
  }

  if (
    serviceCode === BILLING_OPERATION_SERVICE_CODES.operationInvalidated ||
    serviceCode === BILLING_OPERATION_SERVICE_CODES.checkoutNotAvailable ||
    serviceCode === BILLING_OPERATION_SERVICE_CODES.recoveryExhausted ||
    serviceCode === BILLING_OPERATION_SERVICE_CODES.responseExpired
  ) {
    return 'terminal';
  }

  return 'retryable';
}

export { BILLING_OPERATION_SERVICE_CODES, getBillingOperationErrorDisposition };
export type { BillingOperationErrorDisposition };
