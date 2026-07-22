import type { Metadata } from 'next';

import { getLocale, getTranslations } from 'next-intl/server';

import { validateAuthorizeInput, type AuthorizeValidationError } from '@/lib/oauth-server';
import { redirect } from '@dayopt/i18n/navigation';
import type { routing } from '@dayopt/i18n/routing';

import { OAuthErrorPanel } from '../_components/OAuthErrorPanel';

/**
 * `/oauth/authorize` (RFC 6749 §4.1.1) — Authorization Code grant の入口。
 *
 * 役割は params 検証のみ。ユーザーへの表示 (consent UI) は `/oauth/consent` に分離。
 * Vercel rewrite は介さず Next.js page として直接到達する。
 *
 * 認証は middleware (proxy.ts) が enforce する。未認証時は `/auth/login?redirect=...`
 * へ飛ばされ、ログイン後に元の `?response_type=...` を含む URL に戻ってくる。
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('oauth.consent');
  return { title: t('pageTitle') };
}

type AppLocale = (typeof routing.locales)[number];

interface AuthorizePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ERROR_MESSAGE_KEY: Record<AuthorizeValidationError, string> = {
  unsupported_response_type: 'unsupportedResponseType',
  invalid_client: 'invalidClient',
  invalid_redirect_uri: 'invalidRedirectUri',
  missing_pkce: 'missingPkce',
  invalid_scope: 'invalidScope',
  invalid_resource: 'invalidResource',
};

export default async function AuthorizePage({ searchParams }: AuthorizePageProps) {
  const params = await searchParams;
  const stringParam = (key: string): string | undefined => {
    const v = params[key];
    return typeof v === 'string' ? v : undefined;
  };

  const validation = validateAuthorizeInput({
    response_type: stringParam('response_type'),
    client_id: stringParam('client_id'),
    redirect_uri: stringParam('redirect_uri'),
    code_challenge: stringParam('code_challenge'),
    code_challenge_method: stringParam('code_challenge_method'),
    scope: stringParam('scope'),
    state: stringParam('state'),
    resource: stringParam('resource'),
  });

  if (!validation.ok) {
    // NOTE (Phase 1.5): RFC 6749 §4.1.2.1 では client_id / redirect_uri が valid な
    // ときは error params を query に乗せて redirect_uri へ redirect すべき
    // (unsupported_response_type / invalid_scope / missing_pkce 等)。Phase 1 は安全側に
    // 振って常時 inline render している。Phase 1.5 で trustedRedirect を判定して分岐する。
    const t = await getTranslations('oauth.error');
    return <OAuthErrorPanel message={t(ERROR_MESSAGE_KEY[validation.error])} />;
  }

  const consentQuery = new URLSearchParams({
    client_id: validation.client.id,
    redirect_uri: validation.redirectUri,
    code_challenge: validation.codeChallenge,
    scope: validation.scopes.join(' '),
    resource: validation.resourceUri,
  });
  if (validation.state) consentQuery.set('state', validation.state);

  const locale = (await getLocale()) as AppLocale;
  return redirect({ href: `/oauth/consent?${consentQuery.toString()}`, locale });
}
