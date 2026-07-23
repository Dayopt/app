import 'server-only';

import { captureUnexpectedDatabaseError } from '@/lib/sentry';

import {
  MCP_MUTATION_RECEIPT_SCHEMA_VERSION,
  McpMutationError,
  type McpMutationErrorCode,
  type McpPlanCreateInput,
  type McpPlanCreateReceipt,
} from './mutation-contract';
import { createMcpMutationDb } from './mutation-db';

interface MutationDatabaseError {
  code?: unknown;
}

const EXPECTED_ERROR_CODES: Readonly<Record<string, McpMutationErrorCode>> = {
  '22004': 'INVALID_INPUT',
  '22023': 'INVALID_INPUT',
  '23P01': 'TIME_OVERLAP',
  DM003: 'WRITE_DISABLED',
  DM004: 'AUTHORIZATION_LOST',
  DM005: 'PRO_REQUIRED',
  DM006: 'IDEMPOTENCY_KEY_REUSED',
  DT001: 'NOT_FOUND',
  DT002: 'CONFLICT',
  DT003: 'INVALID_TIME_RANGE',
  DT004: 'PLAN_IN_PAST',
  DT005: 'RECORD_IN_FUTURE',
  DT006: 'PLAN_TIME_LOCKED',
  DT007: 'SKIP_IN_FUTURE',
  DT008: 'INVALID_INPUT',
  DT009: 'FORBIDDEN',
  DT011: 'ALREADY_RECORDED',
  DT012: 'INVALID_INPUT',
};

const ERROR_MESSAGES: Readonly<Record<McpMutationErrorCode, string>> = {
  ALREADY_RECORDED: 'Plan already has an active record.',
  AUTHORIZATION_LOST: 'The Dayopt connection is no longer authorized for this change.',
  CONFLICT: 'The change conflicted with another update. Read the latest data and try again.',
  FORBIDDEN: 'This item cannot be changed.',
  IDEMPOTENCY_KEY_REUSED: 'This operation ID was already used for a different change.',
  INVALID_INPUT: 'The mutation input is invalid.',
  INVALID_TIME_RANGE: 'Time range end must be after start.',
  MUTATION_FAILED: 'Dayopt could not apply the change.',
  NOT_FOUND: 'The requested item was not found.',
  PLAN_IN_PAST: 'Plans must end in the future.',
  PLAN_TIME_LOCKED: 'Past plan time fields cannot be changed.',
  PRO_REQUIRED: 'Dayopt Pro is required for MCP changes.',
  RECORD_IN_FUTURE: 'Records cannot end in the future.',
  SKIP_IN_FUTURE: 'Future plans cannot be skipped. Delete the plan instead.',
  TIME_OVERLAP: 'This time range overlaps with an existing item.',
  WRITE_DISABLED: 'Dayopt MCP changes are temporarily disabled.',
};

class SanitizedMcpMutationDatabaseError extends Error {
  constructor(public readonly code: string) {
    super('Unexpected MCP mutation database failure');
    this.name = 'SanitizedMcpMutationDatabaseError';
  }
}

function mutationError(code: McpMutationErrorCode): McpMutationError {
  return new McpMutationError(code, ERROR_MESSAGES[code]);
}

function throwMutationDatabaseError(error: MutationDatabaseError, operation: string): never {
  const databaseCode =
    typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : undefined;
  const mappedCode = databaseCode ? EXPECTED_ERROR_CODES[databaseCode] : undefined;
  if (mappedCode) throw mutationError(mappedCode);
  if (databaseCode === '40P01') throw mutationError('CONFLICT');

  // Do not attach the PostgREST object as a cause: database messages can contain
  // private constraint details. The stable SQLSTATE is sufficient for triage.
  const original = captureUnexpectedDatabaseError(
    new SanitizedMcpMutationDatabaseError(databaseCode ?? 'UNKNOWN'),
    {
      feature: 'mcp',
      operation,
    },
  );
  throw new McpMutationError('MUTATION_FAILED', ERROR_MESSAGES.MUTATION_FAILED, {
    cause: original,
  });
}

interface PlanCreateReceiptRow {
  schema_version: typeof MCP_MUTATION_RECEIPT_SCHEMA_VERSION;
  operation_id: string;
  resource_type: 'plan';
  resource_id: string;
  version: string;
  deleted_at: null;
  replayed: boolean;
}

function isPlanCreateReceipt(
  row: unknown,
  expectedOperationId: string,
): row is PlanCreateReceiptRow {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return false;
  const candidate = row as Record<string, unknown>;
  return (
    candidate.schema_version === MCP_MUTATION_RECEIPT_SCHEMA_VERSION &&
    candidate.operation_id === expectedOperationId &&
    candidate.resource_type === 'plan' &&
    typeof candidate.resource_id === 'string' &&
    typeof candidate.version === 'string' &&
    candidate.deleted_at === null &&
    typeof candidate.replayed === 'boolean'
  );
}

/**
 * Service-role access stays inside this adapter. Callers provide only the
 * current OAuth binding and typed Plan fields; arbitrary SQL/table access is
 * not exposed.
 */
export class McpMutationClient {
  private readonly db = createMcpMutationDb();

  async createPlan(input: McpPlanCreateInput): Promise<McpPlanCreateReceipt> {
    const operation = 'apply_mcp_plan_create';
    const request = () =>
      this.db.applyPlanCreate({
        p_access_token_id: input.accessTokenId,
        p_connection_id: input.connectionId,
        p_end_at: input.endAt,
        p_note: input.note,
        p_operation_id: input.operationId,
        p_start_at: input.startAt,
        p_tag_id: input.tagId,
        p_title: input.title,
      });

    let result;
    try {
      result = await request();
      if (result.error?.code === '40P01') result = await request();
    } catch (error) {
      const code =
        error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
      throwMutationDatabaseError({ code }, operation);
    }

    if (result.error) throwMutationDatabaseError(result.error, operation);

    const row: unknown = result.data?.length === 1 ? result.data[0] : undefined;
    if (!isPlanCreateReceipt(row, input.operationId)) {
      throwMutationDatabaseError({ code: 'INVALID_RECEIPT' }, operation);
    }

    return {
      schemaVersion: row.schema_version,
      operationId: row.operation_id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      version: row.version,
      deletedAt: row.deleted_at,
      replayed: row.replayed,
    };
  }
}

export function createMcpMutationClient(): McpMutationClient {
  return new McpMutationClient();
}
