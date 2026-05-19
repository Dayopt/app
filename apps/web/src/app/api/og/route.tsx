import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const title = searchParams.get('title') || 'Dayopt';
    const description =
      searchParams.get('description') ||
      'スケーラブルなアプリケーションのためのモダンSaaSプラットフォーム';
    const type = searchParams.get('type') || 'default';
    const category = searchParams.get('category');
    const author = searchParams.get('author');
    const date = searchParams.get('date');

    // Brand colors
    const brandColors = {
      primary: '#2563eb', // blue-600
      secondary: '#7c3aed', // violet-600
      accent: '#059669', // emerald-600
      text: '#1f2937', // gray-800
      textLight: '#6b7280', // gray-500
      background: '#ffffff',
      gradient: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    };

    // Type-specific configurations
    const typeConfig = {
      blog: {
        icon: '📝',
        color: brandColors.accent,
        label: 'Blog Post',
      },
      docs: {
        icon: '📚',
        color: brandColors.primary,
        label: 'Documentation',
      },
      release: {
        icon: '🚀',
        color: brandColors.secondary,
        label: 'Release Notes',
      },
      default: {
        icon: '📦',
        color: brandColors.primary,
        label: 'Dayopt',
      },
    };

    const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.default;

    return new ImageResponse(
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          backgroundColor: brandColors.background,
          backgroundImage: `linear-gradient(135deg, ${brandColors.primary}08 0%, ${brandColors.secondary}08 100%)`,
          padding: '60px',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '12px',
              backgroundColor: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              marginRight: '20px',
            }}
          >
            {config.icon}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: '24px',
                fontWeight: '700',
                color: brandColors.text,
                lineHeight: '1.2',
              }}
            >
              Dayopt
            </div>
            <div
              style={{
                fontSize: '16px',
                color: brandColors.textLight,
                fontWeight: '500',
              }}
            >
              {config.label}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            width: '100%',
          }}
        >
          <h1
            style={{
              fontSize: title.length > 60 ? '48px' : '56px',
              fontWeight: '800',
              color: brandColors.text,
              lineHeight: '1.1',
              marginBottom: '24px',
              maxWidth: '100%',
              wordWrap: 'break-word',
            }}
          >
            {title}
          </h1>

          {description && (
            <p
              style={{
                fontSize: '24px',
                color: brandColors.textLight,
                lineHeight: '1.4',
                margin: '0',
                maxWidth: '90%',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {description}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            marginTop: '40px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {category && (
              <div
                style={{
                  backgroundColor: `${config.color}15`,
                  color: config.color,
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginRight: '16px',
                }}
              >
                {category}
              </div>
            )}
            {author && (
              <div
                style={{
                  color: brandColors.textLight,
                  fontSize: '16px',
                  fontWeight: '500',
                }}
              >
                By {author}
              </div>
            )}
          </div>

          {date && (
            <div
              style={{
                color: brandColors.textLight,
                fontSize: '16px',
                fontWeight: '500',
              }}
            >
              {new Date(date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          )}
        </div>

        {/* Decorative Elements */}
        <div
          style={{
            position: 'absolute',
            top: '0',
            right: '0',
            width: '400px',
            height: '400px',
            background: `linear-gradient(135deg, ${brandColors.primary}20, ${brandColors.secondary}20)`,
            borderRadius: '50%',
            filter: 'blur(100px)',
            opacity: '0.5',
            transform: 'translate(50%, -50%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            width: '300px',
            height: '300px',
            background: `linear-gradient(135deg, ${brandColors.secondary}15, ${brandColors.accent}15)`,
            borderRadius: '50%',
            filter: 'blur(80px)',
            opacity: '0.6',
            transform: 'translate(-50%, 50%)',
          }}
        />
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
