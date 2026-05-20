import { ImageResponse } from 'next/og';

import { OG_COLORS } from '@/lib/og-colors';

export const runtime = 'edge';

export const alt = 'Dayopt';
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
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: OG_COLORS.foreground,
            lineHeight: 1,
          }}
        >
          D
        </div>
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
        Dayopt
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
          dayopt.app
        </div>
      </div>
    </div>,
    { ...size },
  );
}
