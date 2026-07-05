import { afterEach, describe, expect, it, vi } from 'vitest';

import { validateAuthorizeInput } from './authorize-validation';

const baseAuthorizeInput = {
  response_type: 'code',
  client_id: 'claude-ai',
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  code_challenge: 'challenge',
  code_challenge_method: 'S256',
  scope: 'read:entries',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateAuthorizeInput redirect_uri allowlist', () => {
  it('accepts exact registered redirect URIs', () => {
    const result = validateAuthorizeInput(baseAuthorizeInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.redirectUri).toBe('https://claude.ai/api/mcp/auth_callback');
    }
  });

  it('rejects sibling HTTPS paths for ChatGPT', () => {
    const allowed = validateAuthorizeInput({
      ...baseAuthorizeInput,
      client_id: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    });
    const siblingPath = validateAuthorizeInput({
      ...baseAuthorizeInput,
      client_id: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect/extra',
    });
    const arbitraryPath = validateAuthorizeInput({
      ...baseAuthorizeInput,
      client_id: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/anything',
    });

    expect(allowed.ok).toBe(true);
    expect(siblingPath).toEqual({ ok: false, error: 'invalid_redirect_uri' });
    expect(arbitraryPath).toEqual({ ok: false, error: 'invalid_redirect_uri' });
  });

  it('rejects arbitrary Cursor custom-scheme callbacks', () => {
    const allowed = validateAuthorizeInput({
      ...baseAuthorizeInput,
      client_id: 'cursor',
      redirect_uri: 'cursor://anysphere.cursor-mcp/oauth/callback',
    });
    const siblingPath = validateAuthorizeInput({
      ...baseAuthorizeInput,
      client_id: 'cursor',
      redirect_uri: 'cursor://anysphere.cursor-mcp/oauth/callback/extra',
    });
    const arbitraryCallback = validateAuthorizeInput({
      ...baseAuthorizeInput,
      client_id: 'cursor',
      redirect_uri: 'cursor://attacker.example/oauth/callback',
    });

    expect(allowed.ok).toBe(true);
    expect(siblingPath).toEqual({ ok: false, error: 'invalid_redirect_uri' });
    expect(arbitraryCallback).toEqual({ ok: false, error: 'invalid_redirect_uri' });
  });

  it('accepts configured ChatGPT redirect URIs by exact string only', () => {
    vi.stubEnv('OAUTH_CHATGPT_REDIRECT_URIS', 'https://chatgpt.com/connector/oauth/dayopt-prod');

    const configured = validateAuthorizeInput({
      ...baseAuthorizeInput,
      client_id: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector/oauth/dayopt-prod',
    });
    const configuredSibling = validateAuthorizeInput({
      ...baseAuthorizeInput,
      client_id: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector/oauth/dayopt-prod/extra',
    });

    expect(configured.ok).toBe(true);
    expect(configuredSibling).toEqual({ ok: false, error: 'invalid_redirect_uri' });
  });
});
