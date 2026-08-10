import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimeInput } from '../TimeInput';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      'aria.startTime': 'Start time',
      'aria.endTime': 'End time',
    })[key] ?? key,
}));

vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/lib/hooks/useUserPreferences', () => ({
  useUserPreferences: (selector: (preferences: { timeFormat: '24h' }) => unknown) =>
    selector({ timeFormat: '24h' }),
}));

describe('TimeInput', () => {
  it('開始時刻入力に翻訳されたaccessible nameを付ける', () => {
    render(<TimeInput kind="start" value="09:00" onChange={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Start time' })).toBeInTheDocument();
  });

  it('終了時刻入力に翻訳されたaccessible nameを付ける', () => {
    render(<TimeInput kind="end" value="10:00" onChange={vi.fn()} minTime="09:00" />);

    expect(screen.getByRole('combobox', { name: 'End time' })).toBeInTheDocument();
  });
});
