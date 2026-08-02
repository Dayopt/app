import { dayoptBrand, dayoptDomains } from '@dayopt/config';
import { OG_COLORS } from '@dayopt/foundations/og-colors';
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const maxDuration = 25;
export const runtime = 'edge';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const title = searchParams.get('title') || '守れる計画を、立てられるように。';
    const description =
      searchParams.get('description') ||
      '計画と実績を、ひとつのタイムラインに。ズレが見えるから、明日の計画がうまくなる。';
    const type = searchParams.get('type') || 'default';
    const category = searchParams.get('category');
    const author = searchParams.get('author');
    const date = searchParams.get('date');

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
      },
    );
  } catch {
    return new Response('Failed to generate image', { status: 500 });
  }
}
