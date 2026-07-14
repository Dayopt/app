import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  isValidTimeModelRange,
  TimeblockEditor,
  type TimeModelEditorValue,
} from '../TimeblockEditor';

vi.mock('@/features/timeblock', () => ({
  DateTimeSection: () => <div data-testid="date-time-section" />,
}));

const value: TimeModelEditorValue = {
  note: '',
  tagId: 'tag-1',
  startAt: new Date('2099-07-14T09:00:00.000Z'),
  endAt: new Date('2099-07-14T10:00:00.000Z'),
  source: 'plan',
};

describe('TimeblockEditor', () => {
  it('開始が終了以降の入力を未確定として扱う', () => {
    expect(
      isValidTimeModelRange({
        ...value,
        startAt: new Date('2099-07-14T10:00:00.000Z'),
        endAt: new Date('2099-07-14T10:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('詳細画面に保存先チップ・タイトル入力・保存ボタンを表示しない', () => {
    render(
      <TimeblockEditor
        value={value}
        onDateTimeChange={vi.fn()}
        onNoteChange={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.queryByText('plan')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('title')).not.toBeInTheDocument();
    expect(screen.getByText('0/1000')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'note' })).toHaveClass(
      'bg-input',
      'border-transparent',
      'resize-none',
    );
    expect(screen.queryByRole('button', { name: 'save' })).not.toBeInTheDocument();
  });

  it('メモ入力の変更とフォーカス解除を上位へ通知する', () => {
    const onNoteChange = vi.fn();
    const onNoteBlur = vi.fn();
    render(
      <TimeblockEditor
        value={value}
        onDateTimeChange={vi.fn()}
        onNoteChange={onNoteChange}
        onNoteBlur={onNoteBlur}
      />,
    );

    const note = screen.getByRole('textbox', { name: 'note' });
    fireEvent.change(note, { target: { value: '調査メモ' } });
    fireEvent.blur(note);

    expect(onNoteChange).toHaveBeenCalledWith('調査メモ');
    expect(onNoteBlur).toHaveBeenCalledOnce();
  });
});
