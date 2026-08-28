/**
 * ContactDialogContent Component Tests
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContactCategory } from '../types';
import { ContactDialogContent, type ContactDialogContentProps } from './ContactDialogContent';

const CATEGORY_LABELS: Record<ContactCategory, string> = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  question: 'Question',
  other: 'Other',
};

const defaultLabels = {
  title: 'Contact Us',
  description: 'Send us your feedback.',
  categoryLabel: 'Category',
  messageLabel: 'Message',
  messagePlaceholder: 'Enter your message...',
  messageMinLength: 'Please enter at least 10 characters.',
  submit: 'Send',
  cancel: 'Cancel',
};

function renderDialog(overrides: Partial<ContactDialogContentProps> = {}) {
  const props: ContactDialogContentProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
    isPending: false,
    categoryLabel: (cat) => CATEGORY_LABELS[cat],
    labels: defaultLabels,
    ...overrides,
  };
  render(<ContactDialogContent {...props} />);
  return props;
}

describe('ContactDialogContent', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 正常系 ──

  it('4つのカテゴリラジオボタンが表示される', () => {
    renderDialog();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(screen.getByText('Bug Report')).toBeInTheDocument();
    expect(screen.getByText('Feature Request')).toBeInTheDocument();
    expect(screen.getByText('Question')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('メッセージ入力 → 送信 → onSubmit が正しい payload で呼ばれる', async () => {
    const props = renderDialog();
    const textarea = screen.getByPlaceholderText('Enter your message...');

    await user.type(textarea, 'This is a valid bug report message.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(props.onSubmit).toHaveBeenCalledWith({
      category: 'bug',
      message: 'This is a valid bug report message.',
    });
  });

  it('カテゴリ変更 → 送信 → 選択したカテゴリが渡される', async () => {
    const props = renderDialog();
    const textarea = screen.getByPlaceholderText('Enter your message...');

    // 「Feature Request」ラジオを選択
    await user.click(screen.getByRole('radio', { name: 'Feature Request' }));
    await user.type(textarea, 'Please add this feature to the app.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(props.onSubmit).toHaveBeenCalledWith({
      category: 'feature',
      message: 'Please add this feature to the app.',
    });
  });

  it('文字数カウンターが入力に連動する', async () => {
    renderDialog();
    const textarea = screen.getByPlaceholderText('Enter your message...');

    expect(screen.getByText('0/5000')).toBeInTheDocument();

    await user.type(textarea, 'Hello');
    expect(screen.getByText('5/5000')).toBeInTheDocument();
  });

  // ── エラー系 ──

  it('10文字未満で送信 → エラーメッセージが表示される', async () => {
    const props = renderDialog();
    const textarea = screen.getByPlaceholderText('Enter your message...');

    await user.type(textarea, 'short');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByText('Please enter at least 10 characters.')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('エラー表示後に入力 → エラーがクリアされる', async () => {
    renderDialog();
    const textarea = screen.getByPlaceholderText('Enter your message...');

    await user.type(textarea, 'short');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('Please enter at least 10 characters.')).toBeInTheDocument();

    await user.type(textarea, ' additional text');
    expect(screen.queryByText('Please enter at least 10 characters.')).not.toBeInTheDocument();
  });

  // ── 状態系 ──

  it('isPending=true → 送信ボタン・キャンセルボタンが disabled', () => {
    renderDialog({ isPending: true });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('isPending=true → ダイアログを閉じられない', async () => {
    const props = renderDialog({ isPending: true });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  // ── リンク ──

  it('mailto リンクが存在する', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    const link = within(dialog).getByRole('link', { name: 'support@dayopt.app' });
    expect(link).toHaveAttribute('href', 'mailto:support@dayopt.app');
  });
});
