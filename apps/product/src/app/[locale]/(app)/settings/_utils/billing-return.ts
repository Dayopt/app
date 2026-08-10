/**
 * 課金の外部サービスからの復帰 query の解釈。
 *
 * Checkout は `?success=true` / `?canceled=true`、Customer Portal は
 * `?portal_return=true` を付けて戻る。生成側は `billing-service.ts` /
 * `billing-mutation-service.ts` の `success_url` / `cancel_url` / `return_url`。
 *
 * Portal に印を付けるのは、復帰を検出しないと課金概要のキャッシュを無効化できず、
 * そこで行った解約や支払方法の変更が画面に反映されないため。query cache は
 * IndexedDB に永続化され（`lib/tanstack-query/persist-storage.ts`）、外部遷移前の
 * 値が staleTime の間そのまま復元される。
 */

type BillingReturnKind = 'checkout_success' | 'checkout_canceled' | 'portal';

const BILLING_RETURN_PARAMS = ['success', 'canceled', 'portal_return'] as const;

export function parseBillingReturn(params: URLSearchParams): BillingReturnKind | null {
  if (params.get('success') === 'true') return 'checkout_success';
  if (params.get('canceled') === 'true') return 'checkout_canceled';
  if (params.get('portal_return') === 'true') return 'portal';
  return null;
}

export function removeBillingReturnParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const param of BILLING_RETURN_PARAMS) {
    next.delete(param);
  }
  return next;
}
