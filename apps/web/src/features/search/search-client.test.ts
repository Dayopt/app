import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureUnexpectedWebError = vi.hoisted(() => vi.fn());

vi.mock('@/platform/observability/capture-unexpected-error', () => ({
  captureUnexpectedWebError,
}));

import { fetchSearchResults } from './search-client';

describe('fetchSearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureUnexpectedWebError.mockImplementation((error: unknown) => error);
  });

  it('valid responseを返し、queryをtelemetry contextへ含めない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                id: 'doc-1',
                title: 'Title',
                description: 'Description',
                url: '/docs/one',
                type: 'docs',
                lastModified: '2026-07-16',
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      fetchSearchResults({ query: 'private phrase', locale: 'ja', operation: 'search_hook' }),
    ).resolves.toMatchObject([{ id: 'doc-1', breadcrumbs: [] }]);
    expect(captureUnexpectedWebError).not.toHaveBeenCalled();
  });

  it.each([400, 429, 500])('HTTP %i responseはserver所有としてcaptureしない', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));

    await expect(
      fetchSearchResults({ query: 'private phrase', locale: 'en', operation: 'search_page' }),
    ).rejects.toBeInstanceOf(Error);
    expect(captureUnexpectedWebError).not.toHaveBeenCalled();
  });

  it.each([
    [vi.fn().mockRejectedValue(new TypeError('fetch failed'))],
    [vi.fn().mockResolvedValue(new Response('{"results":"invalid"}', { status: 200 }))],
  ])(
    'transport/invalid response failureを固定technical contextでcaptureする',
    async (fetchMock) => {
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        fetchSearchResults({ query: 'private phrase', locale: 'en', operation: 'search_page' }),
      ).rejects.toBeInstanceOf(Error);
      expect(captureUnexpectedWebError).toHaveBeenCalledOnce();
      expect(captureUnexpectedWebError.mock.calls[0]?.[1]).toEqual({
        feature: 'search',
        operation: 'search_page',
        route: '/api/search',
        source: 'search_api',
      });
      expect(JSON.stringify(captureUnexpectedWebError.mock.calls)).not.toContain('private phrase');
    },
  );

  it('callerが明示的に中断したrequestだけcaptureしない', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(controller.signal.reason));

    await expect(
      fetchSearchResults({
        query: 'term',
        locale: 'en',
        operation: 'search_dialog_preview',
        signal: controller.signal,
      }),
    ).rejects.toBe(controller.signal.reason);
    expect(captureUnexpectedWebError).not.toHaveBeenCalled();
  });

  it('unrelated AbortErrorはtransport failureとしてcaptureする', async () => {
    const unrelatedAbort = new DOMException('transport timeout', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(unrelatedAbort));

    await expect(
      fetchSearchResults({ query: 'term', locale: 'en', operation: 'search_hook' }),
    ).rejects.toBe(unrelatedAbort);
    expect(captureUnexpectedWebError).toHaveBeenCalledOnce();
  });
});
