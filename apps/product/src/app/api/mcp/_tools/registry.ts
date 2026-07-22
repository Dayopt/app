import type { SupportedScope } from '@/lib/oauth-server';

/** Single source for tool discovery and route-level cached-call authorization. */
export const MCP_TOOL_SCOPE_REQUIREMENTS = {
  'entries.list': 'read:entries',
  'plans.list': 'read:entries',
  'plans.get': 'read:entries',
  'records.list': 'read:entries',
  'records.get': 'read:entries',
  'tags.list': 'read:tags',
  'constraints.get': 'read:constraints',
  'review.get': 'read:stats',
  'plans.create': 'write:plans',
  'plans.update': 'write:plans',
  'plans.trash.list': 'delete:plans',
  'plans.delete': 'delete:plans',
  'plans.restore': 'delete:plans',
  'records.create': 'write:records',
  'records.update': 'write:records',
  'records.trash.list': 'delete:records',
  'records.delete': 'delete:records',
  'records.restore': 'delete:records',
} as const satisfies Record<string, SupportedScope>;

export function getRequiredScopeForTool(toolName: string): SupportedScope | null {
  if (toolName in MCP_TOOL_SCOPE_REQUIREMENTS) {
    return MCP_TOOL_SCOPE_REQUIREMENTS[toolName as keyof typeof MCP_TOOL_SCOPE_REQUIREMENTS];
  }
  return null;
}
