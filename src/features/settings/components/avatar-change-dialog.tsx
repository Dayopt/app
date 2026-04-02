'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { AvatarUpload } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { logger } from '@/lib/logger';
import { createClient } from '@/platform/supabase/client';
import { deleteAvatar, uploadAvatar } from '@/platform/supabase/storage';
import { useAuthStore } from '@/stores/useAuthStore';

interface AvatarChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * アバター変更ダイアログ
 */
export function AvatarChangeDialog({ open, onOpenChange }: AvatarChangeDialogProps) {
  const t = useTranslations();
  const user = useAuthStore((state) => state.user);
  const supabase = createClient();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    user?.user_metadata?.avatar_url || null,
  );
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!user?.id) return;

      setIsUploading(true);
      try {
        const publicUrl = await uploadAvatar(file, user.id);
        setAvatarUrl(publicUrl);

        // Update profile
        await supabase
          .from('profiles')
          .update({
            avatar_url: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        await supabase.auth.updateUser({
          data: { avatar_url: publicUrl },
        });
      } catch (error) {
        logger.error('Avatar upload error:', error);
        throw error;
      } finally {
        setIsUploading(false);
      }
    },
    [user?.id, supabase],
  );

  const handleRemove = useCallback(async () => {
    if (!user?.id) return;

    setIsUploading(true);
    try {
      await deleteAvatar(user.id);
      setAvatarUrl(null);

      // Update profile
      await supabase
        .from('profiles')
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      await supabase.auth.updateUser({
        data: { avatar_url: null },
      });
    } catch (error) {
      logger.error('Avatar delete error:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  }, [user?.id, supabase]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.account.profilePicture')}</DialogTitle>
          <DialogDescription>{t('settings.account.profilePictureDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-6">
          <AvatarUpload
            currentAvatarUrl={avatarUrl}
            onUpload={handleUpload}
            onRemove={handleRemove}
            loading={isUploading}
            size="3xl"
          />
        </div>

        <DialogFooter>
          <Button onClick={handleClose}>{t('common.actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
