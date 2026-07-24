import { z } from 'zod';

import { timeblockContextRangeSchema } from '@/features/timeblock/server/service-index';

import { MCP_TOOL_SCHEMA_VERSION } from './tool-result';

const MCP_OCCUPANCY_SCHEMA = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const MCP_TAG_LIST_INPUT_SCHEMA = z.object({}).strict();

export const MCP_TAG_LIST_OUTPUT_SCHEMA = z
  .object({
    schemaVersion: z.literal(MCP_TOOL_SCHEMA_VERSION),
    count: z.number().int().nonnegative(),
    tags: z.array(
      z
        .object({
          id: z.string().uuid(),
          name: z.string(),
          color: z.string().nullable(),
          icon: z.string().nullable(),
          parentId: z.string().uuid().nullable(),
          sortOrder: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

export const MCP_CONSTRAINTS_GET_INPUT_SCHEMA = timeblockContextRangeSchema;

export const MCP_CONSTRAINTS_GET_OUTPUT_SCHEMA = z
  .object({
    schemaVersion: z.literal(MCP_TOOL_SCHEMA_VERSION),
    asOf: z.string().datetime({ offset: true }),
    timezone: z.string().min(1),
    range: z
      .object({
        startDate: z.string().datetime({ offset: true }),
        endDate: z.string().datetime({ offset: true }),
        endExclusive: z.literal(true),
      })
      .strict(),
    completeness: z
      .object({
        complete: z.literal(true),
        maxItemsPerLane: z.literal(5_000),
      })
      .strict(),
    occupancy: z
      .object({
        plans: z.array(MCP_OCCUPANCY_SCHEMA),
        records: z.array(MCP_OCCUPANCY_SCHEMA),
      })
      .strict(),
    rules: z
      .object({
        intervalBoundary: z.literal('[)'),
        overlap: z
          .object({
            planVsPlan: z.literal('forbidden'),
            recordVsRecord: z.literal('forbidden'),
            planVsRecord: z.literal('allowed'),
          })
          .strict(),
        plans: z
          .object({
            createEnd: z.literal('after_as_of'),
            pastPlanTimeUpdate: z.literal('forbidden'),
            pastPlanContentUpdate: z.literal('allowed'),
            timeUpdateEnd: z.literal('after_as_of'),
            skippedOccupiesLane: z.literal(true),
          })
          .strict(),
        records: z
          .object({
            createEnd: z.literal('at_or_before_as_of'),
            timeUpdateEnd: z.literal('at_or_before_as_of'),
            linkedPlan: z.literal('non_deleted_unskipped_completed'),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
