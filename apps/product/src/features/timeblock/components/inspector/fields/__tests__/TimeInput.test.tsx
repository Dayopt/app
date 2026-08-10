import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeInput } from '../TimeInput';

const mocks = vi.hoisted(() => ({ isMobile: false }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const message = {
      'aria.startTime': 'Start time',
      'aria.endTime': 'End time',
      'aria.timeInputValue': '{label}: {time}',
      'aria.timeInputNotSelected': '{label}: Not selected',
    }[key];

    if (!message) return key;
    return message.replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? `{${name}}`);
  },
}));

vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => mocks.isMobile,
}));

vi.mock('@/lib/hooks/useUserPreferences', () => ({
  useUserPreferences: (selector: (preferences: { timeFormat: '24h' }) => unknown) =>
    selector({ timeFormat: '24h' }),
}));

describe('TimeInput', () => {
  beforeEach(() => {
    mocks.isMobile = false;
  });

  it('開始時刻入力に翻訳されたaccessible nameを付ける', () => {
    render(<TimeInput kind="start" value="09:00" onChange={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Start time' })).toBeInTheDocument();
  });

  it('終了時刻入力に翻訳されたaccessible nameを付ける', () => {
    render(<TimeInput kind="end" value="10:00" onChange={vi.fn()} minTime="09:00" />);

    expect(screen.getByRole('combobox', { name: 'End time' })).toBeInTheDocument();
  });

  it('モバイルの開始時刻buttonは種別と現在値をaccessible nameに含める', () => {
    mocks.isMobile = true;

    render(<TimeInput kind="start" value="09:00" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Start time: 09:00' })).toHaveTextContent('09:00');
  });

  it('モバイルの未設定buttonは種別と未選択状態をaccessible nameに含める', () => {
    mocks.isMobile = true;

    render(<TimeInput kind="end" value="" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'End time: Not selected' })).toHaveTextContent(
      '--:--',
    );
  });
});
