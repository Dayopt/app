'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { useAuthStore } from '@/features/auth';
import { Button } from '@/lib/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/lib/components/ui/dialog';
import { Input } from '@/lib/components/ui/input';
import { Label } from '@/lib/components/ui/label';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

interface DisplayNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
}

/**
 * 表示名変更ダイアログ
 */
export function DisplayNameDialog({ open, onOpenChange, currentName }: DisplayNameDialogProps) {
  const t = useTranslations();
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const supabase = createClient();

  const [displayName, setDisplayName] = useState(currentName);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userId) return;
      if (!displayName.trim()) return;

      setIsLoading(true);
      try {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: displayName.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (profileError) {
          throw new Error(profileError.message);
        }

        const { error: authError } = await supabase.auth.updateUser({
          data: { full_name: displayName.trim() },
        });

        if (authError) {
          logger.error('Auth metadata update error:', authError);
        }

        toast.success(t('settings.account.profileUpdated'));
        onOpenChange(false);
      } catch (error) {
        logger.error('Display name update error:', error);
        toast.error(t('common.errors.generic'));
      } finally {
        setIsLoading(false);
      }
    },
    [displayName, userId, supabase, t, onOpenChange],
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isLoading) return;
      if (isOpen) {
        setDisplayName(currentName);
      }
      onOpenChange(isOpen);
    },
    [currentName, onOpenChange, isLoading],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.account.displayName')}</DialogTitle>
          <DialogDescription>{t('settings.account.displayNameDesc')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="display-name">{t('settings.account.displayName')}</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('settings.account.displayNamePlaceholder')}
                required
                autoComplete="name"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" loading={isLoading} disabled={!displayName.trim()}>
              {t('common.actions.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
