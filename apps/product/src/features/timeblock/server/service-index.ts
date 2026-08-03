/**
 * Service Module
 *
 * plans / records 操作のserver-side composition entry point。
 * routerやMCP adapterが使うnarrow factory / transformerだけを公開する。
 */

export { McpMutationClient } from './mcp-mutation-client';
export { McpMutationError, type McpMutationErrorCode } from './mcp-mutation-contract';
export {
  TimeblockTrashReadError,
  createTimeblockTrashReadClient,
  transformPlanReadModel,
  transformRecordReadModel,
} from './mcp-timeblock-read-client';
export { createPlanService } from './plan-service';
export { createRecordService } from './record-service';
export {
  TIMEBLOCK_CONTEXT_MAX_RANGE_MS,
  isTimeblockDateTime,
  timeblockContextRangeSchema,
} from './timeblock-context-contract';
export { TIMEBLOCK_REVIEW_MAX_TAGS } from './timeblock-review-contract';
