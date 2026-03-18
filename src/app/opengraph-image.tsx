import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Dayopt';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f0a1e 0%, #1a1035 40%, #0d0d1a 100%)',
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
            background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)',
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
            background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)',
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
            background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
            marginBottom: 32,
            boxShadow: '0 8px 32px rgba(124,58,237,0.3)',
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: '#ffffff',
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
            color: '#ffffff',
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
            color: 'rgba(255,255,255,0.6)',
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
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: '0.05em',
            }}
          >
            dayopt.app
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
