import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rateLimit = vi.hoisted(() => ({
  ogImageRateLimit: { limit: vi.fn() },
  ogImageGlobalRateLimit: { limit: vi.fn() },
  getClientIp: vi.fn(() => '203.0.113.10'),
  hashRateLimitIdentifier: vi.fn(async () => 'hashed-client-ip'),
}));

const captureUnexpectedWebError = vi.hoisted(() => vi.fn());

/**
 * next/og の ImageResponse は Satori(WASM)で実描画するため unit test では使わない。
 * element(truncate/allowlist結果の検証用)とoptions(headers)を記録する軽量 stub。
 */
const imageResponseCalls = vi.hoisted(
  () => [] as Array<{ element: unknown; options: Record<string, unknown> }>,
);

vi.mock('@web/platform/security/rate-limit', () => rateLimit);
vi.mock('@web/platform/observability/capture-unexpected-error', () => ({
  captureUnexpectedWebError,
}));
vi.mock('next/og', () => ({
  ImageResponse: class MockImageResponse extends Response {
    constructor(element: unknown, options: Record<string, unknown> = {}) {
      imageResponseCalls.push({ element, options });
      super(null, { status: 200, headers: options.headers as HeadersInit | undefined });
    }
  },
}));

import { GET } from './route';

function request(url = 'https://dayopt.com/api/og?title=Hello'): NextRequest {
  return new NextRequest(url);
}

/** ImageResponse に渡ったJSXツリーから、指定propの値をすべて集める(浅い探索で十分)。 */
function collectTextContent(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectTextContent);
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    const props = (node as { props?: { children?: unknown } }).props;
    return collectTextContent(props?.children);
  }
  return [];
}

describe('OG image route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    imageResponseCalls.length = 0;
    rateLimit.ogImageRateLimit.limit.mockResolvedValue({ success: true });
    rateLimit.ogImageGlobalRateLimit.limit.mockResolvedValue({ success: true });
  });

  it('通常のrequestは200で、CDNキャッシュも効く長寿命cache契約を明示する。fallback用の静的アセット経路とは別にSatoriで動的レンダリングする', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, s-maxage=31536000, immutable',
    );
    expect(imageResponseCalls).toHaveLength(1);
  });

  it('rate limitはraw IPではなくhashed identifierで評価する', async () => {
    await GET(request());

    expect(rateLimit.hashRateLimitIdentifier).toHaveBeenCalledWith('203.0.113.10');
    expect(rateLimit.ogImageRateLimit.limit).toHaveBeenCalledWith('hashed-client-ip');
  });

  it.each([
    ['2001:db8::1', '2001:db8::2', '2001:db8:0:0'],
    ['fe80::abcd:1234:5678:9abc', 'fe80::dead:beef:0:1', 'fe80:0:0:0'],
  ])(
    '同一/64内の異なるIPv6アドレス(%s, %s)は/64プレフィックス(%s)へ丸めてからhashする(#1978と同じ理由)',
    async (ipA, ipB, expectedPrefix) => {
      rateLimit.getClientIp.mockReturnValueOnce(ipA);
      await GET(request());
      expect(rateLimit.hashRateLimitIdentifier).toHaveBeenCalledWith(expectedPrefix);

      rateLimit.hashRateLimitIdentifier.mockClear();
      rateLimit.getClientIp.mockReturnValueOnce(ipB);
      await GET(request());
      expect(rateLimit.hashRateLimitIdentifier).toHaveBeenCalledWith(expectedPrefix);
    },
  );

  it('IPv4アドレスはそのままhashする(IPv6のような丸めをしない)', async () => {
    rateLimit.getClientIp.mockReturnValueOnce('203.0.113.10');

    await GET(request());

    expect(rateLimit.hashRateLimitIdentifier).toHaveBeenCalledWith('203.0.113.10');
  });

  it('IP → global の順で評価する', async () => {
    await GET(request());

    expect(rateLimit.ogImageRateLimit.limit.mock.invocationCallOrder[0]).toBeLessThan(
      rateLimit.ogImageGlobalRateLimit.limit.mock.invocationCallOrder[0]!,
    );
  });

  it('IP quota超過は429で止め、globalは評価せず、cacheさせない', async () => {
    rateLimit.ogImageRateLimit.limit.mockResolvedValue({ success: false });

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(rateLimit.ogImageGlobalRateLimit.limit).not.toHaveBeenCalled();
  });

  it('global quota超過は503ではなく、静的な代替画像を200で返し、Satori/next-ogのレンダリングを一切経由しない(#2052)', async () => {
    rateLimit.ogImageGlobalRateLimit.limit.mockResolvedValue({ success: false });

    const response = await GET(request('https://dayopt.com/api/og?title=Some+Long+Title'));
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300');
    // PNG magic bytes。動的入力(title)が紛れ込んでいないことは、そもそも
    // ImageResponse(Satori)を経由していない(下のassertion)ことで担保される。
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(imageResponseCalls).toHaveLength(0);
  });

  it('rate limit backend障害時も静的な代替画像を200で返してcaptureし、以後はサンプリングして連続失敗でquotaを焼かない', async () => {
    const backendError = new Error('redis unavailable');
    rateLimit.ogImageRateLimit.limit.mockRejectedValue(backendError);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300');
    expect(imageResponseCalls).toHaveLength(0);
    expect(captureUnexpectedWebError).toHaveBeenCalledWith(
      backendError,
      expect.objectContaining({ feature: 'og_image', operation: 'check_rate_limit' }),
    );

    // sampling windowはmodule scopeで永続するため、同一テスト内で連続失敗を再現する。
    await GET(request());
    await GET(request());

    expect(captureUnexpectedWebError).toHaveBeenCalledOnce();
  });

  it('4KB超のquery stringはrender前に400で拒否し、cacheさせない', async () => {
    const hugeTitle = 'a'.repeat(5_000);
    const response = await GET(request(`https://dayopt.com/api/og?title=${hugeTitle}`));

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(rateLimit.ogImageRateLimit.limit).not.toHaveBeenCalled();
  });

  it('長さ上限を超えた通常入力はrejectせずtruncateする', async () => {
    const longTitle = 'x'.repeat(1_000);

    const response = await GET(request(`https://dayopt.com/api/og?title=${longTitle}`));

    expect(response.status).toBe(200);
    const texts = collectTextContent(imageResponseCalls.at(-1)?.element);
    const renderedTitle = texts.find((text) => text.startsWith('xxx'));
    expect(renderedTitle?.length).toBeLessThanOrEqual(120);
  });

  it('allowlistに無いtypeはdefaultのラベルへ落ちる(rejectしない)', async () => {
    const response = await GET(request('https://dayopt.com/api/og?type=malicious'));

    expect(response.status).toBe(200);
    const texts = collectTextContent(imageResponseCalls.at(-1)?.element);
    expect(texts).not.toContain('malicious');
  });
});
