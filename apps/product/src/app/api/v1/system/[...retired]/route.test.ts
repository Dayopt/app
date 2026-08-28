import { describe, expect, it } from 'vitest';

import { GET, OPTIONS, POST } from './route';

describe('/api/v1/system retired endpoint fallback', () => {
  it.each([
    ['GET', GET],
    ['POST', POST],
    ['OPTIONS', OPTIONS],
  ])('returns 404 for %s', (_method, handler) => {
    expect(handler().status).toBe(404);
  });
});
