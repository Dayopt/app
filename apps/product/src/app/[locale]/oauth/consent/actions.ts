'use server';

import { redirect } from 'next/navigation';

import { logger } from '@/lib/logger';
import {
  createOAuthDbClient,
  generateAuthorizationCode,
  hasWriteScope,
  isRuntimeClientWriteEnabled,
  validateAuthorizeInput,
} from '@/lib/oauth-server';
import { assertOAuthAuthorizationRequestHost } from '@/lib/oauth-server/authorization-request-host';
import { captureUnexpectedDatabaseError, observeAuthOperation } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/server';

/**
 * Consent UI から呼ばれる Server Action。
 *
 * Approve: authorization_code を発行 → DB に hash を保存 → redirect_uri?code=...&state=...
 * Deny:    redirect_uri?error=access_denied&state=...
 *
 * Defense in depth: hidden field の改ざんに備え、validateAuthorizeInput を再実行する。
 */
export async function processConsent(formData: FormData) {
  await assertOAuthAuthorizationRequestHost();

  const get = (key: string): string | undefined => {
    const v = formData.get(key);
    return typeof v === 'string' ? v : undefined;
  };

  const validation = validateAuthorizeInput({
    response_type: 'code',
    client_id: get('client_id'),
    redirect_uri: get('redirect_uri'),
    code_challenge: get('code_challenge'),
    code_challenge_method: 'S256',
    scope: get('scope'),
    state: get('state'),
    resource: get('resource'),
  });

  if (!validation.ok) {
    logger.warn(
      { error: validation.error },
      '[oauth] consent action received invalid params (tampered hidden fields?)',
    );
    redirect('/oauth/authorize');
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await observeAuthOperation('oauth_consent_action_get_user', () => supabase.auth.getUser());
  if (authError || !user) {
    redirect('/auth/login');
  }

  const decision = get('decision');
  const redirectUrl = new URL(validation.redirectUri);
  if (validation.state) redirectUrl.searchParams.set('state', validation.state);

  if (decision !== 'approve') {
    redirectUrl.searchParams.set('error', 'access_denied');
    redirect(redirectUrl.toString());
  }

  const { code, hash } = generateAuthorizationCode();
  const dbClient = createOAuthDbClient();
  const { error: insertError } = await dbClient.rpc('create_oauth_authorization_grant_v2', {
    p_code_hash: hash,
    p_user_id: user.id,
    p_client_id: validation.client.id,
    p_resource_uri: validation.resourceUri,
    p_redirect_uri: validation.redirectUri,
    p_code_challenge: validation.codeChallenge,
    p_scopes: validation.scopes,
    p_write_enabled:
      hasWriteScope(validation.scopes) && isRuntimeClientWriteEnabled(validation.client.id),
  });

  if (insertError) {
    logger.error('[oauth] failed to persist authorization code');
    captureUnexpectedDatabaseError(insertError, {
      feature: 'oauth',
      operation: 'persist_authorization_code',
      route: '/oauth/consent',
    });
    redirectUrl.searchParams.set('error', 'server_error');
    redirect(redirectUrl.toString());
  }

  redirectUrl.searchParams.set('code', code);
  redirect(redirectUrl.toString());
}
