export type CanonicalAuthorizationServerUri = string & {
  readonly __canonicalAuthorizationServerUri: unique symbol;
};

export type CanonicalResourceUri = string & {
  readonly __canonicalResourceUri: unique symbol;
};

/**
 * Parse the exact HTTPS origin spellings accepted for OAuth identities.
 *
 * WHATWG URL parsing repairs malformed inputs, so the raw value is constrained
 * before parsing. Empty path and `/` are equivalent; transport paths, userinfo,
 * query, fragment, and non-default ports are not part of Dayopt's identities.
 */
export function normalizeHttpsOrigin(value: string): string | null {
  const lexicalMatch = /^(https):\/\/([A-Za-z0-9.-]+)(?::([0-9]+))?(\/?)/i.exec(value);
  if (
    !lexicalMatch ||
    lexicalMatch[0] !== value ||
    (lexicalMatch[3] && lexicalMatch[3] !== '443')
  ) {
    return null;
  }

  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    return null;
  }

  if (
    origin.protocol !== 'https:' ||
    origin.username !== '' ||
    origin.password !== '' ||
    origin.search !== '' ||
    origin.hash !== '' ||
    (origin.port !== '' && origin.port !== '443') ||
    (origin.pathname !== '' && origin.pathname !== '/')
  ) {
    return null;
  }

  return `https://${origin.hostname.toLowerCase()}`;
}
