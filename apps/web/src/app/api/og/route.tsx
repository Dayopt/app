import { dayoptBrand, dayoptDomains } from '@dayopt/config';
import { OG_COLORS } from '@dayopt/foundations/og-colors';
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

import { captureUnexpectedWebError } from '@web/platform/observability/capture-unexpected-error';
import {
  getClientIp,
  hashRateLimitIdentifier,
  ogImageGlobalRateLimit,
  ogImageRateLimit,
} from '@web/platform/security/rate-limit';

export const maxDuration = 25;
export const runtime = 'edge';

/**
 * 成功レスポンスの正規cache契約。長寿命(内容はpost frontmatterから決定的に導出される)。
 * `s-maxage` を明示しないとVercel Edge NetworkでCDNキャッシュされる保証が無く、
 * hero画像の全アクセスが毎回この関数とUpstash 2往復を経由してしまう。
 */
const OG_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable';
/** global quota超過時・limiter障害時のfallbackはすぐ回復させたいので短命にする。 */
const OG_IMAGE_FALLBACK_CACHE_CONTROL = 'public, max-age=300, s-maxage=300';
/** reject応答はCDN/共有cacheに載せない。 */
const NO_STORE_HEADERS: HeadersInit = { 'Cache-Control': 'no-store' };

/**
 * 各 query field の描画前 upper bound。
 *
 * 400 で reject せず truncate するのは、本 route が blog 記事の hero 画像
 * (`page.tsx` の `heroImage`、cover 画像未設定時に `priority` 付き `<Image>` で
 * 直接配信される)としても使われており、既に公開・SNSシェア済みのリンクを
 * 壊さないため。上限は Satori layout コストを頭打ちにする目的で足りる。
 *
 * title は line-clamp を持たないため、630px canvas を溢れさせない実用的な値に
 * 絞る(既存blog記事のtitleは概算100字以下、`docs/engineering/log/` 未参照)。
 */
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_CATEGORY_LENGTH = 60;
const MAX_AUTHOR_LENGTH = 100;
const MAX_DATE_LENGTH = 40;
/** query string 全体がこれを超えたら、truncateでは吸収しない明らかな異常として reject する。 */
const MAX_QUERY_STRING_LENGTH = 4_096;
/** Upstash障害中のcapture floodを抑えるサンプリング窓。低頻度な他routeのcapture方針とは前提が違う(hero画像として高頻度に叩かれる)。 */
const RATE_LIMIT_FAILURE_CAPTURE_WINDOW_MS = 60_000;
let lastRateLimitFailureCaptureAt = 0;

/**
 * マーケティングサイトの OG 画像
 *
 * apps/product/src/app/opengraph-image.tsx と同じ顔にする。SNS のフィードで
 * ブログ記事とプロダクトのリンクが別ブランドに見えないようにするため、
 * 地色・グロー・ロゴタイルの構成を揃え、色は @dayopt/foundations/og-colors
 * だけを参照する。
 *
 * 以前は白地 + 絵文字タイル + type 別の配色（blog=emerald / release=violet /
 * docs=blue）で、ブランドの紺と無関係な3色が出ていた。type による色分けは廃止し、
 * ラベル文字だけで種別を示す。
 */

/** 種別ラベル。色は変えない（アクセントは紺1色） */
const TYPE_LABELS: Record<string, string> = {
  blog: 'Blog Post',
  docs: 'Documentation',
  release: 'Release Notes',
  default: dayoptBrand.name,
};

const ALLOWED_TYPES: ReadonlySet<string> = new Set(Object.keys(TYPE_LABELS));

/** サロゲートペアを`slice`で分断しない(絵文字混じりのtitle等で文字化けさせない)。 */
function truncate(value: string | null, maxLength: number): string {
  if (!value) return '';
  return Array.from(value).slice(0, maxLength).join('');
}

/**
 * IPv6は/128(フルアドレス)のままidentifierにすると、攻撃者が/64割り当て内の
 * 2^64通りのアドレスを使い分けてIP単位のrate limitを素通りできる(#1978と同じ
 * 理由)。/64プレフィックスまで丸めてから hash する。IPv4はそのまま。
 */
function roundIpv6ToPrefix64(ip: string): string {
  if (!ip.includes(':')) return ip;

  const [head, tail] = ip.split('::');
  const headGroups = head ? head.split(':') : [];
  const prefixGroups =
    tail === undefined
      ? headGroups.slice(0, 4)
      : [...headGroups, ...Array(Math.max(0, 4 - headGroups.length)).fill('0')].slice(0, 4);

  return prefixGroups.join(':');
}

/**
 * Upstash障害中、request単位でSentry captureすると無制限にquotaを焼く
 * (低頻度なcontact/csp-reportと違い、本routeはblog記事のhero画像として
 * 高頻度に叩かれる)。時間窓で1件だけcaptureする。
 */
function captureRateLimitFailureSampled(error: unknown): void {
  const now = Date.now();
  if (now - lastRateLimitFailureCaptureAt < RATE_LIMIT_FAILURE_CAPTURE_WINDOW_MS) return;
  lastRateLimitFailureCaptureAt = now;
  captureUnexpectedWebError(error, {
    feature: 'og_image',
    operation: 'check_rate_limit',
    route: '/api/og',
  });
}

/**
 * global quota超過時・rate limit backend障害時に、blog記事のhero画像
 * (`page.tsx`の`heroImage`)を壊さず200を返すための代替画像。動的入力は
 * 含まないため既知サイズのSatori renderで済み、通常描画より軽いが、
 * 1200x630のラスタライズ自体は避けられない(compute costがゼロになる
 * わけではない。真にゼロにするには静的アセットの配信が必要、#1979 follow-up)。
 */
function renderFallbackImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: OG_COLORS.background,
      }}
    >
      <div style={{ display: 'flex', fontSize: 40, fontWeight: 500, color: OG_COLORS.foreground }}>
        {dayoptBrand.name}
      </div>
    </div>,
    { width: 1200, height: 630, headers: { 'Cache-Control': OG_IMAGE_FALLBACK_CACHE_CONTROL } },
  );
}

export async function GET(request: NextRequest) {
  // 明らかに異常なquery string全体長は、truncateでは吸収しないためrender前にreject。
  if (request.url.length > MAX_QUERY_STRING_LENGTH) {
    return new Response('Request too large', { status: 400, headers: NO_STORE_HEADERS });
  }

  // 他routeと同様、raw IPはUpstashへ残さずhashed identifierだけを渡す。
  const identifier = await hashRateLimitIdentifier(roundIpv6ToPrefix64(getClientIp(request)));

  // IP → global の順で評価する（IP単位quotaは個々のIPだけを罰し、globalはrender
  // コスト全体の天井を守る）。limiter障害時はhero画像を壊さないfallbackへdegrade
  // する(503を返すとblog記事のhero画像が読者全員から見えなくなる)。
  try {
    const ipResult = await ogImageRateLimit.limit(identifier);
    if (!ipResult.success) {
      return new Response('Too many requests', { status: 429, headers: NO_STORE_HEADERS });
    }

    const globalResult = await ogImageGlobalRateLimit.limit('global');
    if (!globalResult.success) {
      return renderFallbackImage();
    }
  } catch (error) {
    captureRateLimitFailureSampled(error);
    return renderFallbackImage();
  }

  try {
    const { searchParams } = new URL(request.url);

    const title =
      truncate(searchParams.get('title'), MAX_TITLE_LENGTH) || '守れる計画を、立てられるように。';
    const description =
      truncate(searchParams.get('description'), MAX_DESCRIPTION_LENGTH) ||
      '計画と実績を、ひとつのタイムラインに。ズレが見えるから、明日の計画がうまくなる。';
    const rawType = searchParams.get('type');
    const type = rawType && ALLOWED_TYPES.has(rawType) ? rawType : 'default';
    const category = truncate(searchParams.get('category'), MAX_CATEGORY_LENGTH);
    const author = truncate(searchParams.get('author'), MAX_AUTHOR_LENGTH);
    const date = truncate(searchParams.get('date'), MAX_DATE_LENGTH);

    const typeLabel = TYPE_LABELS[type] ?? TYPE_LABELS.default;

    return new ImageResponse(
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: `linear-gradient(135deg, ${OG_COLORS.backgroundDark} 0%, ${OG_COLORS.backgroundMid} 40%, ${OG_COLORS.background} 100%)`,
          padding: '60px',
          // Satori に font データを渡していないため実描画は Satori 既定の書体になる。
          // 指定は将来 font を埋め込む時の宣言として product の書体に合わせておく。
          fontFamily: 'Source Sans 3, system-ui, sans-serif',
        }}
      >
        {/* 装飾グロー（product の OG と同じ位置・大きさ） */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${OG_COLORS.primaryGlow15} 0%, transparent 70%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -120,
            left: -60,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${OG_COLORS.primaryGlow10} 0%, transparent 70%)`,
          }}
        />

        {/* ヘッダー: ロゴタイル + ブランド名 + 種別 */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${OG_COLORS.primary} 0%, ${OG_COLORS.primaryLight} 100%)`,
              boxShadow: `0 8px 32px ${OG_COLORS.primaryGlow30}`,
              marginRight: 20,
            }}
          >
            <svg
              width={38}
              height={38}
              viewBox="0 0 24 24"
              fill={OG_COLORS.foreground}
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 3.5c4.69 0 8.5 3.81 8.5 8.5s-3.81 8.5-8.5 8.5S3.5 16.69 3.5 12 7.31 3.5 12 3.5Zm0 3.2A5.31 5.31 0 0 0 6.7 12c0 2.92 2.38 5.3 5.3 5.3s5.3-2.38 5.3-5.3h-3.1a2.2 2.2 0 1 1-2.2-2.2V6.7Z" />
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 500,
                color: OG_COLORS.foreground,
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}
            >
              {dayoptBrand.name}
            </div>
            <div style={{ fontSize: 16, color: OG_COLORS.mutedSubtle, letterSpacing: '0.05em' }}>
              {typeLabel}
            </div>
          </div>
        </div>

        {/* 本文 */}
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <div
            style={{
              fontSize: title.length > 60 ? 48 : 56,
              fontWeight: 500,
              color: OG_COLORS.foreground,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              marginBottom: 24,
              maxWidth: '100%',
            }}
          >
            {title}
          </div>

          {description && (
            <div
              style={{
                fontSize: 24,
                color: OG_COLORS.muted,
                lineHeight: 1.4,
                letterSpacing: '-0.01em',
                maxWidth: '90%',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {description}
            </div>
          )}
        </div>

        {/* フッター: カテゴリ / 著者 / 日付 / ドメイン */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {category && (
              <div
                style={{
                  display: 'flex',
                  backgroundColor: OG_COLORS.primaryChip,
                  color: OG_COLORS.foreground,
                  padding: '8px 16px',
                  borderRadius: 20,
                  fontSize: 14,
                  fontWeight: 500,
                  marginRight: 16,
                }}
              >
                {category}
              </div>
            )}
            {/* display:flex は Satori の要件。子が複数ある div に無いと描画が失敗する */}
            {author && (
              <div style={{ display: 'flex', color: OG_COLORS.muted, fontSize: 16 }}>
                {`By ${author}`}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            {date && (
              <div style={{ display: 'flex', color: OG_COLORS.muted, fontSize: 16 }}>
                {new Date(date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            )}
            {!date && (
              <div
                style={{
                  display: 'flex',
                  fontSize: 14,
                  color: OG_COLORS.mutedSubtle,
                  letterSpacing: '0.05em',
                }}
              >
                {dayoptDomains.marketing}
              </div>
            )}
          </div>
        </div>
      </div>,
      {
        width: 1200,
        height: 630,
        headers: { 'Cache-Control': OG_IMAGE_CACHE_CONTROL },
      },
    );
  } catch {
    return new Response('Failed to generate image', { status: 500, headers: NO_STORE_HEADERS });
  }
}
