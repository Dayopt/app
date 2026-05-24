'use client';

/**
 * タグリネームモーダル
 *
 * `TagMergeModal` と同じく `useShellStore.activeSheet` で管理され、
 * どこからでも `useTagModalNavigation().openTagRenameModal(tag)` で開ける。
 * 名前だけを変更する軽量フォーム（色 / アイコン / グループは別 UI で変更）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/lib/components/ui/dialog';
import { FieldError } from '@/lib/components/ui/field';
import { Input } from '@/lib/components/ui/input';
import { TAG_NAME_MAX_LENGTH } from '../lib/tag-colors';

import { useUpdateTag } from '../hooks/useTagCrudMutations';
import { useTags } from '../hooks/useTagsQuery';

import type { TagRenameTarget } from '@/lib/stores/useShellStore';

interface TagRenameModalProps {
  open: boolean;
  onClose: () => void;
  tag: TagRenameTarget;
}

export function TagRenameModal({ open, onClose, tag }: TagRenameModalProps) {
  const formKey = open ? `${tag.id}:${tag.name}` : 'closed';

  return <TagRenameModalForm key={formKey} open={open} onClose={onClose} tag={tag} />;
}

function TagRenameModalForm({ open, onClose, tag }: TagRenameModalProps) {
  const t = useTranslations('calendar.filter.renamePopover');
  const tCommon = useTranslations('common');

  const { data: existingTags } = useTags();
  const updateTagMutation = useUpdateTag();

  const [name, setName] = useState(tag.name);
  const [debouncedName, setDebouncedName] = useState(tag.name);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedName(name), 200);
    return () => clearTimeout(id);
  }, [name]);

  const trimmedDebounced = debouncedName.trim();

  const duplicate = useMemo(() => {
    if (!trimmedDebounced) return false;
    const lower = trimmedDebounced.toLowerCase();
    return (existingTags ?? []).some(
      (other) =>
        other.id !== tag.id &&
        (other.parent_id ?? null) === (tag.parent_id ?? null) &&
        other.name.toLowerCase() === lower,
    );
  }, [existingTags, tag.id, tag.parent_id, trimmedDebounced]);

  const trimmedLive = name.trim();
  const unchanged = trimmedLive === tag.name;
  const canSubmit = trimmedLive.length > 0 && !duplicate && !unchanged && !submitting;

  const errorMessage = duplicate ? t('duplicateName') : null;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await updateTagMutation.mutateAsync({ id: tag.id, name: trimmedLive });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, updateTagMutation, tag.id, trimmedLive, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!canSubmit) return;
        void handleSubmit();
      }
    },
    [canSubmit, handleSubmit],
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1 px-4">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('namePlaceholder')}
            aria-label={t('name')}
            aria-invalid={duplicate || undefined}
            maxLength={TAG_NAME_MAX_LENGTH}
            disabled={submitting}
          />
          {errorMessage ? <FieldError announceImmediately>{errorMessage}</FieldError> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            loading={submitting}
          >
            {tCommon('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
