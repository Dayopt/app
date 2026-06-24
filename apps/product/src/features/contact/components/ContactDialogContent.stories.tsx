import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, screen, userEvent, within } from 'storybook/test';

import { Button } from '@dayopt/components';

import type { ContactCategory } from '../types';
import { ContactDialogContent } from './ContactDialogContent';

const CATEGORY_LABELS: Record<ContactCategory, string> = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  question: 'Question',
  other: 'Other',
};

const defaultLabels = {
  title: 'Contact Us',
  description:
    'Send us your feedback, report a bug, or request a feature. You can also email us directly at',
  categoryLabel: 'Category',
  messageLabel: 'Message',
  messagePlaceholder: 'Enter your message...',
  messageMinLength: 'Please enter at least 10 characters.',
  submit: 'Send',
  cancel: 'Cancel',
};

/** ContactDialogContent - お問い合わせフォームUI */
const meta = {
  title: 'Product/Features/Contact/ContactDialogContent',
  component: ContactDialogContent,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    onSubmit: fn(),
    isPending: false,
    categoryLabel: (cat: ContactCategory) => CATEGORY_LABELS[cat],
    labels: defaultLabels,
  },
} satisfies Meta<typeof ContactDialogContent>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Interactive Wrapper
// ─────────────────────────────────────────────────────────

function InteractiveContactDialog() {
  const [open, setOpen] = useState(false);
  const handleSubmit = fn();

  return (
    <>
      <Button onClick={() => setOpen(true)}>Contact Us</Button>
      <ContactDialogContent
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        isPending={false}
        categoryLabel={(cat) => CATEGORY_LABELS[cat]}
        labels={defaultLabels}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** ボタンクリックでダイアログを開く。 */
export const Default: Story = {
  args: { open: false },
  render: () => <InteractiveContactDialog />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /contact/i }));
    // Dialog はポータルなのでdocument.bodyを確認
    await expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
  },
};

/** フォーム初期状態（空フォーム）。 */
export const Empty: Story = {};

/** 送信中状態。ボタンがローディング表示になりキャンセル不可。 */
export const Submitting: Story = {
  args: { isPending: true },
};

/** メッセージ入力後に送信ボタンが有効になる。 */
export const FilledForm: Story = {
  play: async () => {
    const dialog = within(screen.getByRole('dialog'));
    const textarea = dialog.getByRole('textbox');
    await userEvent.type(textarea, 'This is a detailed bug report about the calendar feature.');
    const submitButton = dialog.getByRole('button', { name: /send/i });
    await expect(submitButton).toBeEnabled();
  },
};

/** 10文字未満で送信するとエラー表示。 */
export const ValidationError: Story = {
  play: async () => {
    const dialog = within(screen.getByRole('dialog'));
    const textarea = dialog.getByRole('textbox');
    await userEvent.type(textarea, 'short');
    await userEvent.click(dialog.getByRole('button', { name: /send/i }));
    await expect(dialog.getByText('Please enter at least 10 characters.')).toBeInTheDocument();
  },
};

/** カテゴリをラジオボタンで切り替えて送信。 */
export const CategorySelection: Story = {
  play: async () => {
    const dialog = within(screen.getByRole('dialog'));
    // Feature Request を選択
    const featureRadio = dialog.getByRole('radio', { name: /feature request/i });
    await userEvent.click(featureRadio);
    await expect(featureRadio).toBeChecked();

    // Bug Report に戻す
    const bugRadio = dialog.getByRole('radio', { name: /bug report/i });
    await userEvent.click(bugRadio);
    await expect(bugRadio).toBeChecked();
    await expect(featureRadio).not.toBeChecked();
  },
};

/** mailto リンクが正しく設定されている。 */
export const EmailLink: Story = {
  play: async () => {
    const dialog = within(screen.getByRole('dialog'));
    const link = dialog.getByRole('link', { name: /support@dayopt\.app/i });
    await expect(link).toBeInTheDocument();
    await expect(link).toHaveAttribute('href', 'mailto:support@dayopt.app');
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <ContactDialogContent
        open
        onOpenChange={fn()}
        onSubmit={fn()}
        isPending={false}
        categoryLabel={(cat) => CATEGORY_LABELS[cat]}
        labels={defaultLabels}
      />
    </div>
  ),
};
