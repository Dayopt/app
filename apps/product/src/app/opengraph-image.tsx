import { ImageResponse } from 'next/og';

import { dayoptBrand, dayoptDomains } from '@dayopt/config';

import { OG_COLORS } from './opengraph-colors';

export const runtime = 'edge';

export const alt = dayoptBrand.name;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${OG_COLORS.backgroundDark} 0%, ${OG_COLORS.backgroundMid} 40%, ${OG_COLORS.background} 100%)`,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Decorative circles */}
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

      {/* Logo mark */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 80,
          height: 80,
          borderRadius: 20,
          background: `linear-gradient(135deg, ${OG_COLORS.primary} 0%, ${OG_COLORS.primaryLight} 100%)`,
          marginBottom: 32,
          boxShadow: `0 8px 32px ${OG_COLORS.primaryGlow30}`,
        }}
      >
        <svg
          width={48}
          height={48}
          viewBox="0 0 24 24"
          fill={OG_COLORS.foreground}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 3.5c4.69 0 8.5 3.81 8.5 8.5s-3.81 8.5-8.5 8.5S3.5 16.69 3.5 12 7.31 3.5 12 3.5Zm0 3.2A5.31 5.31 0 0 0 6.7 12c0 2.92 2.38 5.3 5.3 5.3s5.3-2.38 5.3-5.3h-3.1a2.2 2.2 0 1 1-2.2-2.2V6.7Z" />
        </svg>
      </div>

      {/* App name */}
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          color: OG_COLORS.foreground,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          marginBottom: 16,
        }}
      >
        {dayoptBrand.name}
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 24,
          color: OG_COLORS.muted,
          fontWeight: 400,
          letterSpacing: '-0.01em',
        }}
      >
        Plan your day. Track your time. Optimize your life.
      </div>

      {/* Subtle bottom bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 14,
            color: OG_COLORS.mutedSubtle,
            letterSpacing: '0.05em',
          }}
        >
          {dayoptDomains.marketing}
        </div>
      </div>
    </div>,
    { ...size },
  );
}
