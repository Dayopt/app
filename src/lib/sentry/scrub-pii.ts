/**
 * Sentry event の PII スクラビング
 *
 * `Sentry.init` の `beforeSend` から呼び出し、exception message / URL /
 * breadcrumbs / contexts など全フィールドを walk して PII を redact する。
 *
 * 対象:
 * - email アドレス (`foo@bar.com`)
 * - JWT-like token (`eyJ...`)
 * - 長い 16進 / base64url token（recovery code 等）
 * - PII_KEYS に含まれる key を持つ object value
 *
 * 設計方針:
 * - in-place 変更ではなく shallow clone で非破壊
 * - 深さ制限 (MAX_DEPTH) で circular / 巨大オブジェクトを抑制
 * - 文字列は regex で pattern match、object は key name で判定
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/data-management/sensitive-data/
 */

import type { ErrorEvent, EventHint } from '@sentry/nextjs';

const PII_KEYS = new Set([
  'email',
  'mail',
  'name',
  'phone',
  'address',
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  'api_key',
  'apikey',
  'recoverycode',
  'recovery_code',
]);

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

// email: 最小限の正規表現（false positive を許容してでも確実に redact）
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/g;
// JWT: eyJ で始まる 3 part base64url。header/payload/signature が全て長め
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
// recovery code / API key 的な長い hex / base64url（連続 32 文字以上）
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{32,}\b/g;

/**
 * URL / query string の sensitive param (email, token 等) を redact
 */
function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://x.invalid');
    let changed = false;
    parsed.searchParams.forEach((_value, key) => {
      if (PII_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, REDACTED);
        changed = true;
      }
    });
    if (!changed) return scrubString(url);
    if (url.startsWith('http')) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return scrubString(url);
  }
}

function scrubString(input: string): string {
  return input
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(JWT_RE, '[REDACTED_JWT]')
    .replace(LONG_TOKEN_RE, (match) => {
      if (match.startsWith('REDACTED')) return match;
      return '[REDACTED_TOKEN]';
    });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth >= MAX_DEPTH) return value;
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (isPlainObject(value)) return scrubObject(value, depth + 1);
  return value;
}

function scrubObject(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      result[key] = REDACTED;
      continue;
    }
    if (key.toLowerCase() === 'url' && typeof value === 'string') {
      result[key] = scrubUrl(value);
      continue;
    }
    result[key] = scrubValue(value, depth);
  }
  return result;
}

/**
 * Sentry event 全体から PII を redact する
 *
 * `beforeSend(event)` の戻り値として渡せる形で新 event を返す。
 * `event` 自身は変更しない。
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  // Sentry の公開型は厳密すぎて一部 narrow できないので、内部は Record<string, unknown>
  // として操作し、最後に ErrorEvent に戻す。beforeSend が期待する shape は緩い ので安全。
  const source = event as unknown as Record<string, unknown>;
  const cloned: Record<string, unknown> = { ...source };

  // exception message
  const exception = source.exception;
  if (isPlainObject(exception) && Array.isArray(exception.values)) {
    cloned.exception = {
      ...exception,
      values: exception.values.map((ex: unknown) => {
        if (!isPlainObject(ex)) return ex;
        if (typeof ex.value === 'string') {
          return { ...ex, value: scrubString(ex.value) };
        }
        return ex;
      }),
    };
  }

  // request URL / headers / cookies / data
  const request = source.request;
  if (isPlainObject(request)) {
    const req: Record<string, unknown> = { ...request };
    if (typeof req.url === 'string') req.url = scrubUrl(req.url);
    if (isPlainObject(req.headers)) req.headers = scrubObject(req.headers, 0);
    if (isPlainObject(req.query_string)) {
      req.query_string = scrubObject(req.query_string, 0);
    } else if (typeof req.query_string === 'string') {
      req.query_string = scrubString(req.query_string);
    }
    if (typeof req.cookies === 'string') req.cookies = REDACTED;
    if (isPlainObject(req.data)) req.data = scrubObject(req.data, 0);
    else if (typeof req.data === 'string') req.data = scrubString(req.data);
    cloned.request = req;
  }

  // breadcrumbs
  if (Array.isArray(source.breadcrumbs)) {
    cloned.breadcrumbs = source.breadcrumbs.map((bc: unknown) => {
      if (!isPlainObject(bc)) return bc;
      const next: Record<string, unknown> = { ...bc };
      if (typeof bc.message === 'string') next.message = scrubString(bc.message);
      if (isPlainObject(bc.data)) next.data = scrubObject(bc.data, 0);
      return next;
    });
  }

  // extra / contexts / tags
  if (isPlainObject(source.extra)) cloned.extra = scrubObject(source.extra, 0);
  if (isPlainObject(source.contexts)) cloned.contexts = scrubObject(source.contexts, 0);
  if (isPlainObject(source.tags)) {
    const tags: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source.tags)) {
      if (PII_KEYS.has(key.toLowerCase())) {
        tags[key] = REDACTED;
      } else if (typeof value === 'string') {
        tags[key] = scrubString(value);
      } else {
        tags[key] = value;
      }
    }
    cloned.tags = tags;
  }

  // transaction name（URL が入ることがある）
  if (typeof source.transaction === 'string') {
    cloned.transaction = scrubUrl(source.transaction);
  }

  // user: id / username / ip は残すが email は redact
  if (isPlainObject(source.user)) {
    const user: Record<string, unknown> = { ...source.user };
    if (typeof user.email === 'string') user.email = REDACTED;
    if (typeof user.username === 'string') user.username = scrubString(user.username);
    cloned.user = user;
  }

  return cloned as unknown as ErrorEvent;
}

/**
 * `beforeSend` hook に wrap 用ヘルパー
 *
 * 既存の `beforeSend` が ignoredPatterns 等を持っていても、その戻り値を
 * さらに scrub してから Sentry に渡す。
 */
export function withPIIScrub(
  existing?: (event: ErrorEvent, hint: EventHint) => ErrorEvent | null,
): (event: ErrorEvent, hint: EventHint) => ErrorEvent | null {
  return (event, hint) => {
    const filtered = existing ? existing(event, hint) : event;
    if (!filtered) return null;
    return scrubSentryEvent(filtered);
  };
}
