import { z } from 'zod';

import { TIMEBLOCK_REVIEW_MAX_TAGS } from '@/features/timeblock/server/service-index';

import { MCP_CONTEXT_RANGE_SCHEMA } from './context-range-schema';
import { MCP_TIMEBLOCK_TIMESTAMP_SCHEMA } from './timeblock-timestamp-schema';
import { MCP_TOOL_SCHEMA_VERSION } from './tool-result';

export const MCP_REVIEW_GET_INPUT_SCHEMA = MCP_CONTEXT_RANGE_SCHEMA;

const MCP_REVIEW_ACCURACY_STATUS_SCHEMA = z.enum(['excellent', 'good', 'fair', 'poor']);

export const MCP_REVIEW_GET_OUTPUT_SCHEMA = z
  .object({
    schemaVersion: z.literal(MCP_TOOL_SCHEMA_VERSION),
    asOf: MCP_TIMEBLOCK_TIMESTAMP_SCHEMA,
    period: z
      .object({
        startDate: MCP_TIMEBLOCK_TIMESTAMP_SCHEMA,
        endDate: MCP_TIMEBLOCK_TIMESTAMP_SCHEMA,
        endExclusive: z.literal(true),
        timezone: z.string().min(1),
      })
      .strict(),
    basis: z
      .object({
        planMeaning: z.literal('budget'),
        recordMeaning: z.literal('actual'),
        rowFilter: z.literal('active_tagged_start_in_period'),
        durationBoundary: z.literal('full_row_not_clipped'),
        periodBoundary: z.literal('[)'),
        varianceConvention: z.literal('planned_minus_recorded'),
      })
      .strict(),
    hasData: z.boolean(),
    summary: z
      .object({
        plannedMinutes: z.number().nonnegative(),
        recordedMinutes: z.number().nonnegative(),
        varianceMinutes: z.number(),
      })
      .strict(),
    accuracy: z
      .object({
        rate: z.number().min(0).max(1),
        status: MCP_REVIEW_ACCURACY_STATUS_SCHEMA,
      })
      .strict()
      .nullable(),
    tags: z
      .array(
        z
          .object({
            tagId: z.string().uuid(),
            plannedMinutes: z.number().nonnegative(),
            recordedMinutes: z.number().nonnegative(),
            varianceMinutes: z.number(),
            variancePercent: z.number().int().nullable(),
          })
          .strict(),
      )
      .max(TIMEBLOCK_REVIEW_MAX_TAGS),
    signals: z.array(
      z.discriminatedUnion('code', [
        z
          .object({
            code: z.literal('plan_accuracy'),
            rate: z.number().min(0).max(1),
            status: MCP_REVIEW_ACCURACY_STATUS_SCHEMA,
          })
          .strict(),
        z
          .object({
            code: z.literal('largest_tag_variance'),
            tagId: z.string().uuid(),
            direction: z.enum(['recorded_less_than_planned', 'recorded_more_than_planned']),
            absoluteMinutes: z.number().positive(),
          })
          .strict(),
      ]),
    ),
  })
  .strict();
