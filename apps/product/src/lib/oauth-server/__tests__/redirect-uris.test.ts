import { describe, expect, it } from 'vitest';

import {
  isValidOAuthRedirectUri,
  isValidOAuthRedirectUriList,
  parseValidOAuthRedirectUriList,
  type OAuthClientId,
} from '../redirect-uris';

describe('OAuth client redirect URI boundary', () => {
  it.each([
    ['claude-ai', 'https://claude.ai/api/mcp/auth_callback'],
    ['chatgpt', 'https://chatgpt.com/connector_platform_oauth_redirect'],
    ['chatgpt', 'https://chatgpt.com/connector/oauth/dayopt-prod'],
    ['cursor', 'cursor://anysphere.cursor-mcp/oauth/callback'],
  ] satisfies readonly [OAuthClientId, string][])(
    '%sの所有callbackだけを許可する',
    (clientId, uri) => {
      expect(isValidOAuthRedirectUri(clientId, uri)).toBe(true);
    },
  );

  it.each([
    ['claude-ai', 'https://attacker.example/api/mcp/auth_callback'],
    ['claude-ai', 'https://claude.ai/api/mcp/auth_callback/extra'],
    ['claude-ai', 'https://user@claude.ai/api/mcp/auth_callback'],
    ['claude-ai', 'https://claude.ai:443/api/mcp/auth_callback'],
    ['chatgpt', 'https://attacker.example/connector_platform_oauth_redirect'],
    ['chatgpt', 'https://chatgpt.com/connector/oauth/dayopt-prod/extra'],
    ['chatgpt', 'https://chatgpt.com/connector/oauth/dayopt-prod?next=attacker'],
    ['cursor', 'attacker://anysphere.cursor-mcp/oauth/callback'],
    ['cursor', 'cursor://attacker.example/oauth/callback'],
    ['cursor', 'cursor://anysphere.cursor-mcp/oauth/callback#fragment'],
  ] satisfies readonly [OAuthClientId, string][])(
    '%sのattacker origin、別scheme、sibling path、URL付加情報を拒否する',
    (clientId, uri) => {
      expect(isValidOAuthRedirectUri(clientId, uri)).toBe(false);
    },
  );

  it('comma区切りの一部が不正ならenv全体を拒否し、runtimeでも不正URIを除外する', () => {
    const configured = [
      'https://chatgpt.com/connector/oauth/dayopt-staging',
      'https://attacker.example/oauth/callback',
    ].join(',');

    expect(isValidOAuthRedirectUriList('chatgpt', configured)).toBe(false);
    expect(parseValidOAuthRedirectUriList('chatgpt', configured)).toEqual([
      'https://chatgpt.com/connector/oauth/dayopt-staging',
    ]);
  });
});
