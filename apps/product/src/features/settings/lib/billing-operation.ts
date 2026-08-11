/**
 * 支払い操作の失敗を、UIが取れる復旧手段へ畳む。
 *
 * ここで分岐するservice codeは `CLIENT_SAFE_SERVICE_CODES`
 * (`@/lib/trpc/client-safe-service-code`) に登録されていないとerrorFormatterが
 * clientへ載せないため、登録漏れは分岐を丸ごと殺す。両者の一致は
 * `__tests__/billing-operation.test.ts` が実際のerror経路で固定する。
 */
const BILLING_OPERATION_SERVICE_CODES = {
  accountClosing: 'BILLING_ACCOUNT_CLOSING',
  checkoutNotAvailable: 'BILLING_CHECKOUT_NOT_AVAILABLE',
  operationConflict: 'BILLING_OPERATION_CONFLICT',
  operationInvalidated: 'BILLING_OPERATION_INVALIDATED',
  recoveryExhausted: 'BILLING_RECOVERY_EXHAUSTED',
  responseExpired: 'BILLING_RESPONSE_EXPIRED',
} as const;

type BillingOperationServiceCode =
  (typeof BILLING_OPERATION_SERVICE_CODES)[keyof typeof BILLING_OPERATION_SERVICE_CODES];

type BillingOperationErrorDisposition = 'account_closing' | 'retryable' | 'terminal';

/**
 * serverが投げうる全codeの割り当て。
 *
 * `satisfies` が全codeの網羅を強制するので、code追加時にここが漏れるとtypecheckで落ちる。
 * 既定枝（retryable）へ落ちるのはserviceCodeを持たないerror（通信断・未知の失敗）だけ。
 */
const BILLING_OPERATION_ERROR_DISPOSITIONS: Readonly<
  Partial<Record<string, BillingOperationErrorDisposition>>
> = {
  [BILLING_OPERATION_SERVICE_CODES.accountClosing]: 'account_closing',
  [BILLING_OPERATION_SERVICE_CODES.checkoutNotAvailable]: 'terminal',
  [BILLING_OPERATION_SERVICE_CODES.operationConflict]: 'retryable',
  [BILLING_OPERATION_SERVICE_CODES.operationInvalidated]: 'terminal',
  [BILLING_OPERATION_SERVICE_CODES.recoveryExhausted]: 'terminal',
  [BILLING_OPERATION_SERVICE_CODES.responseExpired]: 'terminal',
} satisfies Record<BillingOperationServiceCode, BillingOperationErrorDisposition>;

function getBillingOperationServiceCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('data' in error)) return null;

  const data = error.data;
  if (!data || typeof data !== 'object' || !('serviceCode' in data)) return null;

  return typeof data.serviceCode === 'string' ? data.serviceCode : null;
}

function getBillingOperationErrorDisposition(error: unknown): BillingOperationErrorDisposition {
  const serviceCode = getBillingOperationServiceCode(error);
  if (serviceCode === null) return 'retryable';

  return BILLING_OPERATION_ERROR_DISPOSITIONS[serviceCode] ?? 'retryable';
}

export { BILLING_OPERATION_SERVICE_CODES, getBillingOperationErrorDisposition };
