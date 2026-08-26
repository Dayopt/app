import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { SupabasePreviewDegradedBanner } from '../SupabasePreviewDegradedBanner';

describe('SupabasePreviewDegradedBanner', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Preview + Supabase env 未設定では banner を表示する', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    render(<SupabasePreviewDegradedBanner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('common.supabasePreviewDisabled.banner.title')).toBeInTheDocument();
  });

  it('local dev（env 未設定だが Preview ではない）では何も表示しない', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const { container } = render(<SupabasePreviewDegradedBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('Preview で実 Supabase env が設定済みなら何も表示しない', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-preview.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'real-anon-key');

    const { container } = render(<SupabasePreviewDegradedBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
