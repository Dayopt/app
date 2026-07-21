// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  captureServer: vi.fn(),
}));

vi.mock('@web/platform/observability/operator-smoke-auth', () => ({
  authorizeWebOperatorSmoke: mocks.authorize,
  OPERATOR_SMOKE_RESPONSE_HEADERS: { 'Cache-Control': 'private, no-store, max-age=0' },
  operatorSmokeUnavailableResponse: (status = 404) => new Response(null, { status }),
}));
vi.mock('@web/platform/observability/operator-smoke-capture', () => ({
  captureWebOperatorServerSmoke: mocks.captureServer,
}));

import { GET, OPTIONS, POST } from './route';

const request = new Request('https://dayopt.app/api/v1/system/sentry-smoke/server', {
  method: 'POST',
});

describe('Web operator Sentry smoke route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ authorized: true });
    mocks.captureServer.mockResolvedValue(new Response(null, { status: 202 }));
  });

  it('returns 404 for unsupported surfaces before authorization', async () => {
    const response = await POST(request, { params: Promise.resolve({ surface: 'edge' }) });

    expect(response.status).toBe(404);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it('authorizes browser and server surfaces before dispatch', async () => {
    const browser = await POST(request, { params: Promise.resolve({ surface: 'browser' }) });
    const server = await POST(request, { params: Promise.resolve({ surface: 'server' }) });

    expect(browser.status).toBe(204);
    expect(server.status).toBe(202);
    expect(mocks.authorize).toHaveBeenCalledTimes(2);
    expect(mocks.captureServer).toHaveBeenCalledOnce();
  });

  it('returns the authorization failure and hides GET/OPTIONS', async () => {
    mocks.authorize.mockResolvedValueOnce({
      authorized: false,
      response: new Response(null, { status: 503 }),
    });

    expect((await POST(request, { params: Promise.resolve({ surface: 'server' }) })).status).toBe(
      503,
    );
    expect(GET().status).toBe(404);
    expect(OPTIONS().status).toBe(404);
    expect(mocks.captureServer).not.toHaveBeenCalled();
  });
});
