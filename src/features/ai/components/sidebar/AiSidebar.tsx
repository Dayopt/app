'use client';

import { AlertCircle, FileText, Lightbulb } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SidebarSection } from '@/lib/components/shell/sidebar/SidebarSection';

/**
 * AI モード Sidebar 中身 (Watching AI placeholder)
 *
 * 見出しは CalendarSidebar の Tag セクションと同じ SidebarSection で統一し、
 * content 内の padding も Calendar と同じ「各行が px-2 py-2 を自分で持つ」
 * パターンに揃える (Phase 2-D Step D-6)。
 */
export function AiSidebar() {
  const t = useTranslations('ai.sidebar');

  return (
    <div className="flex flex-col gap-4">
      <SidebarSection title={t('title')}>
        <p className="text-muted-foreground px-2 py-2 text-sm">{t('conversations.empty')}</p>
      </SidebarSection>

      <AiSoonList />
    </div>
  );
}

const SOON_ITEMS = [
  { key: 'weeklyReport', Icon: FileText },
  { key: 'insights', Icon: Lightbulb },
  { key: 'anomaly', Icon: AlertCircle },
] as const;

function AiSoonList() {
  const t = useTranslations('ai.sidebar.soon');

  return (
    <SidebarSection title={t('label')}>
      <div className="flex flex-col">
        {SOON_ITEMS.map(({ key, Icon }) => (
          <div
            key={key}
            className="text-muted-foreground flex flex-col gap-1 px-2 py-2"
            aria-disabled="true"
          >
            <div className="flex items-center gap-2">
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="text-sm">{t(`${key}.title`)}</span>
            </div>
            <span className="text-xs">{t(`${key}.description`)}</span>
          </div>
        ))}
      </div>
    </SidebarSection>
  );
}
