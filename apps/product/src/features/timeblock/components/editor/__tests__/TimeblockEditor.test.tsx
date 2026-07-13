import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimeblockEditor, type TimeModelEditorValue } from '../TimeblockEditor';

vi.mock('@/features/timeblock', () => ({
  DateRow: () => <div data-testid="date-row" />,
  TimeRow: () => <div data-testid="time-row" />,
}));

const value: TimeModelEditorValue = {
  note: '',
  tagId: 'tag-1',
  startAt: new Date('2099-07-14T09:00:00.000Z'),
  endAt: new Date('2099-07-14T10:00:00.000Z'),
  source: 'plan',
};

describe('TimeblockEditor', () => {
  it('詳細画面に保存先チップとタイトル入力を表示しない', () => {
    render(
      <TimeblockEditor value={value} onChange={vi.fn()} onSubmit={vi.fn()} isSubmitting={false} />,
    );

    expect(screen.queryByText('plan')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('title')).not.toBeInTheDocument();
    expect(screen.getByText('0/1000')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'note' })).toHaveClass(
      'bg-input',
      'border-transparent',
      'resize-none',
    );
    expect(screen.getByRole('button', { name: 'save' })).toBeEnabled();
  });
});
