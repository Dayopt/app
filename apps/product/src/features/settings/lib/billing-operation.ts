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

type BillingOperationErrorDisposition =
  'account_closing' | 'checkout_not_available' | 'retryable' | 'terminal';

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
  [BILLING_OPERATION_SERVICE_CODES.checkoutNotAvailable]: 'checkout_not_available',
  [BILLING_OPERATION_SERVICE_CODES.operationConflict]: 'retryable',
  [BILLING_OPERATION_SERVICE_CODES.operationInvalidated]: 'terminal',
  [BILLING_OPERATION_SERVICE_CODES.recoveryExhausted]: 'terminal',
  [BILLING_OPERATION_SERVICE_CODES.responseExpired]: 'terminal',
} satisfies Record<BillingOperationServiceCode, BillingOperationErrorDisposition>;

/**
 * disposition ごとのユーザー向け文言。
 *
 * `satisfies` が全 disposition の割り当てを強制するので、disposition を足して
 * ここが漏れるとtypecheckで落ちる。消費側で `if / else` を書き足す運用にすると
 * 新しい disposition が黙って既定枝の文言に落ちるため、ここへ集約する。
 */
const BILLING_OPERATION_MESSAGE_KEYS = {
  account_closing: 'common.billingOperation.accountClosing',
  checkout_not_available: 'common.billingOperation.checkoutNotAvailable',
  retryable: 'common.billingOperation.retryable',
  terminal: 'common.billingOperation.restart',
} as const satisfies Record<BillingOperationErrorDisposition, string>;

interface BillingOperationErrorPresentation {
  /** アカウント削除中のため、支払い操作の入口をすべて閉じるか */
  closesBillingActions: boolean;
  /** 表示する文言のキー */
  messageKey: (typeof BILLING_OPERATION_MESSAGE_KEYS)[BillingOperationErrorDisposition];
  /** 既にサブスクリプションがあり、checkoutではなくbilling portalが唯一の出口か */
  needsBillingPortal: boolean;
  /** 同じ操作をやり直して成功しうるか。false なら操作をterminalとして確定する */
  retryable: boolean;
}

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

/**
 * 支払い操作の失敗を、消費側がそのまま使える提示内容へ畳む。
 *
 * 文言・再試行ロック・入口の開閉をここで一括して決めることで、消費側 4 箇所
 * （BillingSettings の checkout / portal、PaymentErrorDialog、useAppInlineBanner）が
 * 同じ分岐を写し取らずに済む。
 */
function getBillingOperationErrorPresentation(error: unknown): BillingOperationErrorPresentation {
  const disposition = getBillingOperationErrorDisposition(error);

  return {
    closesBillingActions: disposition === 'account_closing',
    messageKey: BILLING_OPERATION_MESSAGE_KEYS[disposition],
    needsBillingPortal: disposition === 'checkout_not_available',
    retryable: disposition === 'retryable',
  };
}

export { BILLING_OPERATION_SERVICE_CODES, getBillingOperationErrorPresentation };
