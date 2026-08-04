import { z } from 'zod';

import { MCP_CONTEXT_RANGE_SCHEMA } from './context-range-schema';
import { MCP_TIMEBLOCK_TIMESTAMP_SCHEMA } from './timeblock-timestamp-schema';
import { MCP_TOOL_SCHEMA_VERSION } from './tool-result';

const MCP_OCCUPANCY_SCHEMA = z
  .object({
    startAt: MCP_TIMEBLOCK_TIMESTAMP_SCHEMA,
    endAt: MCP_TIMEBLOCK_TIMESTAMP_SCHEMA,
  })
  .strict();

export const MCP_TAG_LIST_INPUT_SCHEMA = z
  .object({
    // 既定は false のまま。既定でアーカイブ済みを混ぜると、新規付与の候補として
    // 選ばれてサービス層の `TAG_ARCHIVED` で弾かれる無駄な試行が増える。
    includeArchived: z.boolean().default(false),
  })
  .strict();

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
          // includeArchived の値によらず常に返す。false 固定になる既定応答でも
          // 行の形を変えないことで、client 側の解釈を 1 通りに保つ。
          isArchived: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export const MCP_CONSTRAINTS_GET_INPUT_SCHEMA = MCP_CONTEXT_RANGE_SCHEMA;

export const MCP_CONSTRAINTS_GET_OUTPUT_SCHEMA = z
  .object({
    schemaVersion: z.literal(MCP_TOOL_SCHEMA_VERSION),
    asOf: MCP_TIMEBLOCK_TIMESTAMP_SCHEMA,
    timezone: z.string().min(1),
    range: z
      .object({
        startDate: MCP_TIMEBLOCK_TIMESTAMP_SCHEMA,
        endDate: MCP_TIMEBLOCK_TIMESTAMP_SCHEMA,
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
