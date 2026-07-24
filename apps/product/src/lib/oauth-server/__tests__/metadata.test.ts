import { describe, expect, it } from 'vitest';

import { buildAuthorizationServerMetadata, buildProtectedResourceMetadata } from '../metadata';

const READ_SCOPES = ['read:entries', 'read:tags', 'read:constraints', 'read:stats'];

describe('OAuth metadata scopes', () => {
  it('authorization server metadataは一般提供する4 read scopeだけを広告する', () => {
    expect(buildAuthorizationServerMetadata().scopes_supported).toEqual(READ_SCOPES);
  });

  it('protected resource metadataは一般提供する4 read scopeだけを広告する', () => {
    expect(buildProtectedResourceMetadata().scopes_supported).toEqual(READ_SCOPES);
  });
});
