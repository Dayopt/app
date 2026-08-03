import 'server-only';

import { z } from 'zod';

import {
  McpMutationClient,
  McpMutationError,
  type McpMutationErrorCode,
} from '@/features/timeblock/server/service-index';
import { logger } from '@/lib/logger';
import { captureUnexpectedMcpToolError } from '@/lib/mcp/tool-error';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { McpRequestContext } from '../_context';
import { MCP_TIMEBLOCK_TIMESTAMP_SCHEMA } from './timeblock-timestamp-schema';
import { createMcpToolError, createMcpToolSuccess, MCP_TOOL_SCHEMA_VERSION } from './tool-result';

const operationIdSchema = z.string().uuid();
const resourceIdSchema = z.string().uuid();
const timestampSchema = MCP_TIMEBLOCK_TIMESTAMP_SCHEMA;
const titleSchema = z.string().min(1).max(200);
const noteSchema = z.string().max(10_000).nullable().optional();
const nullableIdSchema = z.string().uuid().nullable().optional();

const planCreateInputSchema = z
  .object({
    operationId: operationIdSchema,
    title: titleSchema,
    note: noteSchema,
    tagId: nullableIdSchema,
    startAt: timestampSchema,
    endAt: timestampSchema,
  })
  .strict();

const planUpdateInputSchema = z
  .object({
    operationId: operationIdSchema,
    planId: resourceIdSchema,
    expectedUpdatedAt: timestampSchema,
    title: titleSchema.optional(),
    note: noteSchema,
    tagId: nullableIdSchema,
    startAt: timestampSchema.optional(),
    endAt: timestampSchema.optional(),
  })
  .strict();

const planVersionedInputSchema = z
  .object({
    operationId: operationIdSchema,
    planId: resourceIdSchema,
    expectedUpdatedAt: timestampSchema,
  })
  .strict();

const recordCreateInputSchema = z
  .object({
    operationId: operationIdSchema,
    title: titleSchema,
    note: noteSchema,
    tagId: nullableIdSchema,
    planId: nullableIdSchema,
    startAt: timestampSchema,
    endAt: timestampSchema,
  })
  .strict();

const recordUpdateInputSchema = z
  .object({
    operationId: operationIdSchema,
    recordId: resourceIdSchema,
    expectedUpdatedAt: timestampSchema,
    title: titleSchema.optional(),
    note: noteSchema,
    tagId: nullableIdSchema,
    startAt: timestampSchema.optional(),
    endAt: timestampSchema.optional(),
  })
  .strict();

const recordVersionedInputSchema = z
  .object({
    operationId: operationIdSchema,
    recordId: resourceIdSchema,
    expectedUpdatedAt: timestampSchema,
  })
  .strict();

function mutationReceiptOutputSchema(resourceType: 'plan' | 'record', deleted: boolean) {
  return z
    .object({
      schemaVersion: z.literal(MCP_TOOL_SCHEMA_VERSION),
      operationId: operationIdSchema,
      resourceType: z.literal(resourceType),
      resourceId: resourceIdSchema,
      version: z.string(),
      deletedAt: deleted ? z.string() : z.null(),
      replayed: z.boolean(),
    })
    .strict();
}

const planActiveReceiptSchema = mutationReceiptOutputSchema('plan', false);
const planDeletedReceiptSchema = mutationReceiptOutputSchema('plan', true);
const recordActiveReceiptSchema = mutationReceiptOutputSchema('record', false);
const recordDeletedReceiptSchema = mutationReceiptOutputSchema('record', true);

export function registerPlansCreateTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'plans.create',
    {
      title: 'Create a Dayopt plan',
      description: 'Create one future Plan as canonical Dayopt data.',
      inputSchema: planCreateInputSchema,
      outputSchema: planActiveReceiptSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      if (!ctx.scopes.includes('write:plans')) return insufficientScopeResult();
      return handleMutation('plans_create', () =>
        new McpMutationClient().createPlan({
          ...input,
          note: input.note ?? null,
          tagId: input.tagId ?? null,
          connectionId: ctx.connectionId,
          accessTokenId: ctx.tokenId,
        }),
      );
    },
  );
}

export function registerPlansUpdateTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'plans.update',
    {
      title: 'Update a Dayopt plan',
      description: 'Update one active Plan using its exact updated_at version.',
      inputSchema: planUpdateInputSchema,
      outputSchema: planActiveReceiptSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (input) => {
      if (!ctx.scopes.includes('write:plans')) return insufficientScopeResult();
      return handleMutation('plans_update', () =>
        new McpMutationClient().updatePlan({
          operationId: input.operationId,
          planId: input.planId,
          expectedUpdatedAt: input.expectedUpdatedAt,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.tagId !== undefined ? { tagId: input.tagId } : {}),
          ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
          ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
          connectionId: ctx.connectionId,
          accessTokenId: ctx.tokenId,
        }),
      );
    },
  );
}

export function registerPlansDeleteTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'plans.delete',
    {
      title: 'Move a Dayopt plan to trash',
      description: 'Soft-delete one active Plan using its exact updated_at version.',
      inputSchema: planVersionedInputSchema,
      outputSchema: planDeletedReceiptSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (input) => {
      if (!ctx.scopes.includes('delete:plans')) return insufficientScopeResult();
      return handleMutation('plans_delete', () =>
        new McpMutationClient().deletePlan({
          ...input,
          connectionId: ctx.connectionId,
          accessTokenId: ctx.tokenId,
        }),
      );
    },
  );
}

export function registerPlansRestoreTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'plans.restore',
    {
      title: 'Restore a Dayopt plan',
      description: 'Restore one trashed Plan using its exact updated_at version.',
      inputSchema: planVersionedInputSchema,
      outputSchema: planActiveReceiptSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      if (!ctx.scopes.includes('delete:plans')) return insufficientScopeResult();
      return handleMutation('plans_restore', () =>
        new McpMutationClient().restorePlan({
          ...input,
          connectionId: ctx.connectionId,
          accessTokenId: ctx.tokenId,
        }),
      );
    },
  );
}

export function registerRecordsCreateTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'records.create',
    {
      title: 'Create a Dayopt record',
      description: 'Create one past Record as canonical Dayopt data.',
      inputSchema: recordCreateInputSchema,
      outputSchema: recordActiveReceiptSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      if (!ctx.scopes.includes('write:records')) return insufficientScopeResult();
      return handleMutation('records_create', () =>
        new McpMutationClient().createRecord({
          ...input,
          note: input.note ?? null,
          tagId: input.tagId ?? null,
          planId: input.planId ?? null,
          connectionId: ctx.connectionId,
          accessTokenId: ctx.tokenId,
        }),
      );
    },
  );
}

export function registerRecordsUpdateTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'records.update',
    {
      title: 'Update a Dayopt record',
      description: 'Update one active Record using its exact updated_at version.',
      inputSchema: recordUpdateInputSchema,
      outputSchema: recordActiveReceiptSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (input) => {
      if (!ctx.scopes.includes('write:records')) return insufficientScopeResult();
      return handleMutation('records_update', () =>
        new McpMutationClient().updateRecord({
          operationId: input.operationId,
          recordId: input.recordId,
          expectedUpdatedAt: input.expectedUpdatedAt,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.tagId !== undefined ? { tagId: input.tagId } : {}),
          ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
          ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
          connectionId: ctx.connectionId,
          accessTokenId: ctx.tokenId,
        }),
      );
    },
  );
}

export function registerRecordsDeleteTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'records.delete',
    {
      title: 'Move a Dayopt record to trash',
      description: 'Soft-delete one active Record using its exact updated_at version.',
      inputSchema: recordVersionedInputSchema,
      outputSchema: recordDeletedReceiptSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (input) => {
      if (!ctx.scopes.includes('delete:records')) return insufficientScopeResult();
      return handleMutation('records_delete', () =>
        new McpMutationClient().deleteRecord({
          ...input,
          connectionId: ctx.connectionId,
          accessTokenId: ctx.tokenId,
        }),
      );
    },
  );
}

export function registerRecordsRestoreTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'records.restore',
    {
      title: 'Restore a Dayopt record',
      description: 'Restore one trashed Record using its exact updated_at version.',
      inputSchema: recordVersionedInputSchema,
      outputSchema: recordActiveReceiptSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      if (!ctx.scopes.includes('delete:records')) return insufficientScopeResult();
      return handleMutation('records_restore', () =>
        new McpMutationClient().restoreRecord({
          ...input,
          connectionId: ctx.connectionId,
          accessTokenId: ctx.tokenId,
        }),
      );
    },
  );
}

async function handleMutation(
  operation: string,
  mutate: () => Promise<PublicMutationReceipt>,
): Promise<CallToolResult> {
  try {
    return createMcpToolSuccess({ ...(await mutate()) });
  } catch (error) {
    if (error instanceof McpMutationError) {
      return createMcpToolError(error.code, error.message, isRetryableMutationError(error.code));
    }

    captureUnexpectedMcpToolError(error, operation);
    logger.error(`MCP ${operation} failed`);
    return createMcpToolError('MUTATION_FAILED', 'Dayopt could not apply the change.', true);
  }
}

interface PublicMutationReceipt {
  schemaVersion: 1;
  operationId: string;
  resourceType: 'plan' | 'record';
  resourceId: string;
  version: string;
  deletedAt: string | null;
  replayed: boolean;
}

function insufficientScopeResult(): CallToolResult {
  return createMcpToolError(
    'INSUFFICIENT_SCOPE',
    'This connection does not have the scope required for this change.',
  );
}

function isRetryableMutationError(code: McpMutationErrorCode): boolean {
  return code === 'CONFLICT' || code === 'WRITE_DISABLED' || code === 'MUTATION_FAILED';
}
