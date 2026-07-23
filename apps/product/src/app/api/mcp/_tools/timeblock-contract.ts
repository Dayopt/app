import { z } from 'zod';

import { MCP_TOOL_SCHEMA_VERSION } from './tool-result';

const MCP_PLAN_OUTPUT_SCHEMA = {
  id: z.string().uuid(),
  title: z.string(),
  note: z.string().nullable(),
  tagId: z.string().uuid().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  source: z.string(),
  skippedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
} as const;

const MCP_RECORD_OUTPUT_SCHEMA = {
  id: z.string().uuid(),
  title: z.string(),
  note: z.string().nullable(),
  tagId: z.string().uuid().nullable(),
  planId: z.string().uuid().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  source: z.string(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
} as const;

const MCP_ENTRY_OUTPUT_SCHEMA = {
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  origin: z.string(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  actualStartTime: z.string().nullable(),
  actualEndTime: z.string().nullable(),
  durationMinutes: z.number().nullable(),
  tagId: z.string().uuid().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
} as const;

export const MCP_PLAN_LIST_OUTPUT_SCHEMA = {
  schemaVersion: z.literal(MCP_TOOL_SCHEMA_VERSION),
  count: z.number().int().nonnegative(),
  plans: z.array(z.object(MCP_PLAN_OUTPUT_SCHEMA)),
} as const;

export const MCP_RECORD_LIST_OUTPUT_SCHEMA = {
  schemaVersion: z.literal(MCP_TOOL_SCHEMA_VERSION),
  count: z.number().int().nonnegative(),
  records: z.array(z.object(MCP_RECORD_OUTPUT_SCHEMA)),
} as const;

export const MCP_PLAN_GET_OUTPUT_SCHEMA = {
  schemaVersion: z.literal(MCP_TOOL_SCHEMA_VERSION),
  plan: z.object(MCP_PLAN_OUTPUT_SCHEMA),
} as const;

export const MCP_RECORD_GET_OUTPUT_SCHEMA = {
  schemaVersion: z.literal(MCP_TOOL_SCHEMA_VERSION),
  record: z.object(MCP_RECORD_OUTPUT_SCHEMA),
} as const;

export const MCP_ENTRY_LIST_OUTPUT_SCHEMA = {
  schemaVersion: z.literal(MCP_TOOL_SCHEMA_VERSION),
  count: z.number().int().nonnegative(),
  entries: z.array(z.object(MCP_ENTRY_OUTPUT_SCHEMA)),
} as const;
