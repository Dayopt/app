interface TrpcOperationForLogging {
  path: string;
  input: unknown;
}

const REDACTED = '[REDACTED]';

/** 検索語を含むPlan/Record一覧operationはクライアントloggerへ渡さない。 */
export function containsPrivateTimeblockSearch(operation: TrpcOperationForLogging): boolean {
  if (operation.path !== 'plans.list' && operation.path !== 'records.list') return false;
  if (typeof operation.input !== 'object' || operation.input === null) return false;

  const search = Reflect.get(operation.input, 'search');
  return typeof search === 'string' && search.trim().length > 0;
}

/** tRPC error logへ渡すinputを、検索語とproduction入力から隔離する。 */
export function getTrpcErrorLogInput(
  operation: TrpcOperationForLogging,
  environment: string | undefined,
): unknown {
  if (containsPrivateTimeblockSearch(operation)) return REDACTED;
  return environment === 'development' ? operation.input : REDACTED;
}
