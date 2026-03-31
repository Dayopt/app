'use client';

import { memo, useCallback, useEffect, useState } from 'react';

import {
  Bot,
  Calendar,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  RefreshCw,
  Rss,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ApiKeyStorage } from '@/platform/security/encryption';
import { api } from '@/platform/trpc';
import { useAuthStore } from '@/stores/useAuthStore';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';

interface Integration {
  id: string;
  name: string;
  descriptionKey: 'googleCalendarDesc' | 'slackDesc';
  icon: React.ReactNode;
}

interface AIProvider {
  id: string;
  name: string;
  descriptionKey: 'anthropicDesc' | 'openaiDesc';
  keyPrefix: string;
}

const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    descriptionKey: 'anthropicDesc',
    keyPrefix: 'sk-ant-',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    descriptionKey: 'openaiDesc',
    keyPrefix: 'sk-',
  },
];

const INTEGRATIONS: Integration[] = [
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    descriptionKey: 'googleCalendarDesc',
    icon: <Calendar className="text-primary h-5 w-5" />,
  },
  {
    id: 'slack',
    name: 'Slack',
    descriptionKey: 'slackDesc',
    icon: <MessageSquare className="text-primary h-5 w-5" />,
  },
];

/** 連携設定コンポーネント。AIプロバイダーAPIキー・外部サービス連携・iCalフィード・同期設定を管理 */
export const IntegrationSettings = memo(function IntegrationSettings() {
  const t = useTranslations();
  const user = useAuthStore((state) => state.user);

  // AI API Keys state
  const [aiKeys, setAiKeys] = useState<Record<string, string>>({
    anthropic: '',
    openai: '',
  });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    anthropic: false,
    openai: false,
  });
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({
    anthropic: false,
    openai: false,
  });
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({
    anthropic: false,
    openai: false,
  });

  // 保存済みのAPIキーを読み込み
  useEffect(() => {
    const loadSavedKeys = async () => {
      if (!user?.id) return;

      for (const provider of AI_PROVIDERS) {
        const exists = ApiKeyStorage.exists(provider.id);
        if (exists) {
          const key = await ApiKeyStorage.load(provider.id, user.id);
          if (key) {
            setAiKeys((prev) => ({ ...prev, [provider.id]: key }));
            setSavedKeys((prev) => ({ ...prev, [provider.id]: true }));
          }
        }
      }
    };

    loadSavedKeys();
  }, [user?.id]);

  const handleAiKeyChange = useCallback((providerId: string, value: string) => {
    setAiKeys((prev) => ({ ...prev, [providerId]: value }));
    setSavedKeys((prev) => ({ ...prev, [providerId]: false }));
  }, []);

  const toggleKeyVisibility = useCallback((providerId: string) => {
    setShowKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  }, []);

  const handleSaveApiKey = useCallback(
    async (providerId: string) => {
      if (!user?.id || !aiKeys[providerId]) return;

      setSavingKeys((prev) => ({ ...prev, [providerId]: true }));

      try {
        const success = await ApiKeyStorage.save(providerId, aiKeys[providerId], user.id);
        if (success) {
          setSavedKeys((prev) => ({ ...prev, [providerId]: true }));
        }
      } finally {
        setSavingKeys((prev) => ({ ...prev, [providerId]: false }));
      }
    },
    [user?.id, aiKeys],
  );

  const handleDeleteApiKey = useCallback((providerId: string) => {
    ApiKeyStorage.delete(providerId);
    setAiKeys((prev) => ({ ...prev, [providerId]: '' }));
    setSavedKeys((prev) => ({ ...prev, [providerId]: false }));
  }, []);

  const [syncEnabled, setSyncEnabled] = useState(true);

  const handleSyncChange = useCallback((checked: boolean) => {
    setSyncEnabled(checked);
  }, []);

  return (
    <div className="space-y-8">
      {/* AI設定 */}
      <SectionCard title={t('settings.integrations.ai.title')}>
        <div className="space-y-4">
          <div className="bg-card border-border-subtle rounded-lg border p-4 shadow-sm">
            <p className="text-muted-foreground text-sm">
              {t('settings.integrations.ai.description')}
            </p>
          </div>

          {AI_PROVIDERS.map((provider) => (
            <div key={provider.id} className="border-border rounded-2xl border p-4">
              <div className="flex items-start gap-4">
                <div className="bg-container flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                  <Bot className="text-primary h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-normal">{provider.name}</h4>
                    {savedKeys[provider.id] && (
                      <Badge variant="outline" className="text-success gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {t('settings.integrations.ai.saved')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t(`settings.integrations.ai.${provider.descriptionKey}`)}
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showKeys[provider.id] ? 'text' : 'password'}
                        placeholder={`${provider.keyPrefix}...`}
                        value={aiKeys[provider.id]}
                        onChange={(e) => handleAiKeyChange(provider.id, e.target.value)}
                        className="pr-8"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon
                        className="absolute top-1/2 right-1 -translate-y-1/2"
                        onClick={() => toggleKeyVisibility(provider.id)}
                        aria-label={
                          showKeys[provider.id]
                            ? t('settings.integrations.ai.hideKey')
                            : t('settings.integrations.ai.showKey')
                        }
                      >
                        {showKeys[provider.id] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => handleSaveApiKey(provider.id)}
                      disabled={!aiKeys[provider.id] || savingKeys[provider.id]}
                    >
                      {savingKeys[provider.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t('settings.integrations.ai.save')
                      )}
                    </Button>
                    {savedKeys[provider.id] && (
                      <Button
                        variant="ghost"
                        onClick={() => handleDeleteApiKey(provider.id)}
                        className="text-destructive hover:text-destructive"
                        aria-label={t('settings.integrations.ai.deleteKey')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 連携サービス一覧 */}
      <SectionCard title={t('settings.integrations.services.title')}>
        <div className="space-y-4">
          {INTEGRATIONS.map((integration) => (
            <div
              key={integration.id}
              className="border-border flex items-center justify-between rounded-2xl border p-4"
            >
              <div className="flex items-center gap-4">
                <div className="bg-container flex h-10 w-10 items-center justify-center rounded-2xl">
                  {integration.icon}
                </div>
                <div>
                  <h4 className="text-sm font-normal">{integration.name}</h4>
                  <p className="text-muted-foreground text-sm">
                    {t(`settings.integrations.services.${integration.descriptionKey}`)}
                  </p>
                </div>
              </div>
              <Button variant="ghost" disabled>
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('common.comingSoon')}
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 同期設定 */}
      <SectionCard title={t('settings.integrations.sync.title')}>
        <LabeledRow label={t('settings.integrations.sync.enableLabel')}>
          <Switch checked={syncEnabled} onCheckedChange={handleSyncChange} />
        </LabeledRow>
        {syncEnabled && (
          <div className="bg-card border-border-subtle mt-4 rounded-lg border p-4 shadow-sm">
            <p className="text-muted-foreground text-sm">
              {t('settings.integrations.sync.description')}
            </p>
          </div>
        )}
      </SectionCard>

      {/* iCalフィード */}
      <ICalFeedSection />

      {/* API連携 */}
      <SectionCard title={t('settings.integrations.api.title')}>
        <div className="space-y-4">
          <div className="bg-card border-border-subtle rounded-lg border p-4 shadow-sm">
            <p className="text-muted-foreground text-sm">
              {t('settings.integrations.api.description')}
            </p>
          </div>
          <Button variant="ghost" disabled>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('settings.integrations.api.openPortal')}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
});

/**
 * iCalフィード設定セクション
 */
const ICalFeedSection = memo(function ICalFeedSection() {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const utils = api.useUtils();

  const { data: tokenData, isPending } = api.userSettings.getICalToken.useQuery();
  const regenerateMutation = api.userSettings.regenerateICalToken.useMutation({
    onSuccess: () => {
      utils.userSettings.getICalToken.invalidate();
      toast.success(t('settings.integrations.icalFeed.regenerateSuccess'));
    },
    onError: () => {
      toast.error(t('common.errors.generic'));
    },
  });

  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
  const feedUrl = tokenData?.token ? `${baseUrl}/api/v1/calendar/${tokenData.token}.ics` : null;

  const handleCopy = useCallback(async () => {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [feedUrl]);

  const handleRegenerate = useCallback(() => {
    if (tokenData?.token) {
      setRegenerateDialogOpen(true);
      return;
    }
    regenerateMutation.mutate();
  }, [tokenData?.token, regenerateMutation]);

  const handleRegenerateConfirm = useCallback(() => {
    setRegenerateDialogOpen(false);
    regenerateMutation.mutate();
  }, [regenerateMutation]);

  return (
    <>
      <SectionCard title={t('settings.integrations.icalFeed.title')}>
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="bg-container flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
              <Rss className="text-primary h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <p className="text-muted-foreground text-sm">
                {t('settings.integrations.icalFeed.description')}
              </p>

              {isPending ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                </div>
              ) : feedUrl ? (
                <div className="space-y-2">
                  <LabeledRow label={t('settings.integrations.icalFeed.feedUrl')}>
                    <div className="flex items-center gap-2">
                      <Input value={feedUrl} readOnly className="font-mono text-xs" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        aria-label={t('settings.integrations.icalFeed.copy')}
                      >
                        {copied ? (
                          <CheckCircle2 className="text-success h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </LabeledRow>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {t('settings.integrations.icalFeed.noToken')}
                </p>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={handleRegenerate}
                disabled={regenerateMutation.isPending}
              >
                {regenerateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {t('settings.integrations.icalFeed.regenerate')}
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      <AlertDialog open={regenerateDialogOpen} onOpenChange={setRegenerateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.integrations.icalFeed.regenerateConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.integrations.icalFeed.regenerateConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerateConfirm}>
              {t('settings.integrations.icalFeed.regenerate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
