'use client';

import { useState } from 'react';

import { Camera, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChronotypeSettingsPanel as ChronotypeSettings } from '@/features/chronotype';
import { getAvatarUrl, getDisplayName, getInitials } from '@/lib/user';
import { useAuthStore } from '@/stores/useAuthStore';

import { AvatarChangeDialog } from './avatar-change-dialog';
import { DisplayNameDialog } from './display-name-dialog';
import { ValueRankingSettings } from './value-ranking-settings';
import { ValuesSettings } from './values-settings';

/**
 * プロフィール設定コンポーネント
 *
 * アバター、表示名、クロノタイプ、価値観キーワード、価値評定スケール
 */
export function ProfileSettings() {
  const t = useTranslations();
  const user = useAuthStore((state) => state.user);

  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const [showDisplayNameDialog, setShowDisplayNameDialog] = useState(false);

  const avatarUrl = getAvatarUrl(user);
  const displayName = getDisplayName(user);

  return (
    <div className="space-y-8">
      {/* アバター・表示名 */}
      <SectionCard title={t('settings.account.profile')}>
        <LabeledRow label={t('settings.account.avatar')}>
          <button
            type="button"
            className="group relative cursor-pointer"
            onClick={() => setShowAvatarDialog(true)}
            aria-label={t('settings.account.avatar')}
          >
            <Avatar size="sm">
              <AvatarImage src={avatarUrl || undefined} alt={displayName} />
              <AvatarFallback className="bg-foreground text-background text-xs">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="group-hover:bg-foreground/40 absolute inset-0 flex items-center justify-center rounded-full transition-colors">
              <Camera className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </button>
        </LabeledRow>
        <LabeledRow label={t('settings.account.displayName')}>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            onClick={() => setShowDisplayNameDialog(true)}
          >
            <span className="text-sm">{displayName}</span>
            <ChevronDown className="h-4 w-4" />
          </button>
        </LabeledRow>
      </SectionCard>

      {/* クロノタイプ */}
      <ChronotypeSettings />

      {/* 価値観キーワード */}
      <ValueRankingSettings />

      {/* 価値評定スケール */}
      <ValuesSettings />

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
