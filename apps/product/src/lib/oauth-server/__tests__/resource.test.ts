import { describe, expect, it } from 'vitest';

import { normalizeResourceUri, resolveRequestedResource } from '../resource';

describe('OAuth MCP resource normalization', () => {
  it.each([
    'https://mcp.dayopt.app',
    'https://MCP.DAYOPT.APP',
    'HTTPS://mcp.dayopt.app',
    'https://mcp.dayopt.app/',
    'https://mcp.dayopt.app:443',
  ])('accepts an equivalent canonical origin: %s', (value) => {
    expect(resolveRequestedResource(value)).toBe('https://mcp.dayopt.app');
  });

  it.each([
    'http://mcp.dayopt.app',
    'https://user@mcp.dayopt.app',
    'https://mcp.dayopt.app:444',
    'https://mcp.dayopt.app/mcp',
    'https://mcp.dayopt.app/api/mcp',
    'https://mcp.dayopt.app?resource=other',
    'https://mcp.dayopt.app#fragment',
    'https://other.dayopt.app',
    'not-a-url',
  ])('rejects a different or unsafe resource identity: %s', (value) => {
    expect(resolveRequestedResource(value)).toBeNull();
  });

  it('does not accept a missing resource', () => {
    expect(resolveRequestedResource(undefined)).toBeNull();
  });

  it('normalizes only the URL identity, not a transport path', () => {
    expect(normalizeResourceUri('https://mcp.dayopt.app/')).toBe('https://mcp.dayopt.app');
    expect(normalizeResourceUri('https://mcp.dayopt.app/mcp')).toBeNull();
  });
});
