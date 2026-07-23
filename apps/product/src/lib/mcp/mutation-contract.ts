export const MCP_MUTATION_RECEIPT_SCHEMA_VERSION = 1 as const;

export interface McpPlanCreateInput {
  connectionId: string;
  accessTokenId: string;
  operationId: string;
  title: string;
  note: string | null;
  tagId: string | null;
  startAt: string;
  endAt: string;
}

export interface McpPlanCreateReceipt {
  schemaVersion: typeof MCP_MUTATION_RECEIPT_SCHEMA_VERSION;
  operationId: string;
  resourceType: 'plan';
  resourceId: string;
  /** Raw PostgreSQL timestamptz version. Do not round-trip through Date. */
  version: string;
  deletedAt: null;
  replayed: boolean;
}

export type McpMutationErrorCode =
  | 'ALREADY_RECORDED'
  | 'AUTHORIZATION_LOST'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVALID_INPUT'
  | 'INVALID_TIME_RANGE'
  | 'MUTATION_FAILED'
  | 'NOT_FOUND'
  | 'PLAN_IN_PAST'
  | 'PLAN_TIME_LOCKED'
  | 'PRO_REQUIRED'
  | 'RECORD_IN_FUTURE'
  | 'SKIP_IN_FUTURE'
  | 'TIME_OVERLAP'
  | 'WRITE_DISABLED';

export class McpMutationError extends Error {
  constructor(
    public readonly code: McpMutationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'McpMutationError';
  }
}
