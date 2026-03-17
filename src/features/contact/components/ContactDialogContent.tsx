'use client';

/**
 * お問い合わせダイアログUI（Presentational）
 *
 * tRPC に依存しない純粋UIコンポーネント。
 * ContactDialog（Container）から呼ばれる。
 */

import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';

import type { ContactCategory } from '../types';

const CATEGORIES: ContactCategory[] = ['bug', 'feature', 'question', 'other'];

export interface ContactDialogContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { category: ContactCategory; message: string }) => void;
  isPending: boolean;
  categoryLabel: (category: ContactCategory) => string;
  labels: {
    title: string;
    description: string;
    categoryLabel: string;
    messageLabel: string;
    messagePlaceholder: string;
    messageMinLength: string;
    submit: string;
    cancel: string;
  };
}

export function ContactDialogContent({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  categoryLabel,
  labels,
}: ContactDialogContentProps) {
  const [category, setCategory] = useState<ContactCategory>('bug');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setCategory('bug');
    setMessage('');
    setError('');
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isPending) return;
      if (isOpen) {
        resetForm();
      }
      onOpenChange(isOpen);
    },
    [onOpenChange, isPending, resetForm],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (message.trim().length < 10) {
        setError(labels.messageMinLength);
        return;
      }
      setError('');
      onSubmit({ category, message });
    },
    [category, message, onSubmit, labels.messageMinLength],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>
            {labels.description}{' '}
            <a href="mailto:support@dayopt.app" className="text-primary hover:underline">
              support@dayopt.app
            </a>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* カテゴリ */}
            <div className="space-y-2">
              <Label>{labels.categoryLabel}</Label>
              <RadioGroup
                value={category}
                onValueChange={(value: string) => setCategory(value as ContactCategory)}
                className="grid grid-cols-2 gap-2"
              >
                {CATEGORIES.map((cat) => (
                  <Label
                    key={cat}
                    htmlFor={`contact-category-${cat}`}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <RadioGroupItem id={`contact-category-${cat}`} value={cat} />
                    <span className="text-sm">{categoryLabel(cat)}</span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* メッセージ */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="contact-message">{labels.messageLabel}</Label>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {message.length}/5000
                </span>
              </div>
              <Textarea
                id="contact-message"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (error) setError('');
                }}
                placeholder={labels.messagePlaceholder}
                maxLength={5000}
                className={`h-32 resize-none overflow-y-auto${error ? 'ring-destructive ring-2' : ''}`}
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {labels.cancel}
            </Button>
            <Button type="submit" isLoading={isPending} disabled={isPending}>
              {labels.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
