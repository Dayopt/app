'use client';

import { useState } from 'react';

import { Camera } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/features/auth';
import { getAvatarUrl, getDisplayName, getInitials } from '@/lib/user';

import { AvatarChangeDialog } from './avatar-change-dialog';
import { DisplayNameDialog } from './display-name-dialog';

/**
 * プロフィール設定コンポーネント
 *
 * アバター、表示名
 */
export function ProfileSettings() {
  const t = useTranslations();
  const user = useAuthStore((state) => state.user);

  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const [showDisplayNameDialog, setShowDisplayNameDialog] = useState(false);

  const avatarUrl = getAvatarUrl(user);
  const displayName = getDisplayName(user);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* アバター・表示名 */}
      <SectionCard title={t('settings.account.profile')}>
        <LabeledRow
          label={t('settings.account.avatar')}
          variant="navigate"
          onClick={() => setShowAvatarDialog(true)}
        >
          <div className="group relative">
            <Avatar size="sm">
              <AvatarImage src={avatarUrl || undefined} alt={displayName} />
              <AvatarFallback className="bg-foreground text-background text-xs">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="group-hover:bg-foreground absolute inset-0 flex items-center justify-center rounded-full transition-colors group-hover:opacity-40">
              <Camera className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </div>
        </LabeledRow>
        <LabeledRow
          label={t('settings.account.displayName')}
          variant="navigate"
          onClick={() => setShowDisplayNameDialog(true)}
        >
          <span className="text-muted-foreground">{displayName}</span>
        </LabeledRow>
      </SectionCard>

      {/* Dialogs */}
      <AvatarChangeDialog open={showAvatarDialog} onOpenChange={setShowAvatarDialog} />
      <DisplayNameDialog
        open={showDisplayNameDialog}
        onOpenChange={setShowDisplayNameDialog}
        currentName={displayName}
      />
    </div>
  );
}
