/**
 * Stripe Checkout からの復帰 query（`?success=true` / `?canceled=true`）の解釈。
 *
 * 遷移先は `billing-service.ts` / `billing-mutation-service.ts` が組み立てる
 * `success_url` / `cancel_url` と対応する。
 */

type CheckoutCallbackResult = 'success' | 'canceled';

const CHECKOUT_CALLBACK_PARAMS = ['success', 'canceled'] as const;

export function parseCheckoutCallbackResult(
  success: string | null,
  canceled: string | null,
): CheckoutCallbackResult | null {
  if (success === 'true') return 'success';
  if (canceled === 'true') return 'canceled';
  return null;
}

export function removeCheckoutCallbackParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const param of CHECKOUT_CALLBACK_PARAMS) {
    next.delete(param);
  }
  return next;
}
