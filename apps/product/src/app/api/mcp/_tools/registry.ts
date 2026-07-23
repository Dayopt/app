import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { ADVERTISED_SCOPES, type SupportedScope } from '@/lib/oauth-server';

import type { McpRequestContext } from '../_context';
import { registerEntriesListTool } from './entries-list';
import { registerPlansListTool, registerRecordsListTool } from './timeblock-list';

interface McpToolDescriptor {
  name: string;
  requiredScope: SupportedScope;
  register: (server: McpServer, ctx: McpRequestContext) => void;
}

/** Exact set of tools that this deployment can register and authorize. */
export const MCP_TOOL_DESCRIPTORS = [
  {
    name: 'entries.list',
    requiredScope: 'read:entries',
    register: registerEntriesListTool,
  },
  {
    name: 'plans.list',
    requiredScope: 'read:entries',
    register: registerPlansListTool,
  },
  {
    name: 'records.list',
    requiredScope: 'read:entries',
    register: registerRecordsListTool,
  },
] as const satisfies readonly McpToolDescriptor[];

const descriptorByName = new Map<string, McpToolDescriptor>(
  MCP_TOOL_DESCRIPTORS.map((descriptor) => [descriptor.name, descriptor] as const),
);

export function getRequiredScopeForTool(toolName: string): SupportedScope | null {
  return descriptorByName.get(toolName)?.requiredScope ?? null;
}

export function mergeMcpChallengeScopes(
  grantedScopes: readonly SupportedScope[],
  missingScopes: readonly SupportedScope[],
): SupportedScope[] {
  return [...new Set<SupportedScope>([...ADVERTISED_SCOPES, ...grantedScopes, ...missingScopes])];
}
