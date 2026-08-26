'use client';

import { useTranslations } from 'next-intl';

import { SidebarSection } from '@/components/shell/sidebar';

import { TemplateRow } from './TemplateRow';
import type { TemplateMock } from './types';

interface TemplateListProps {
  templates: ReadonlyArray<TemplateMock>;
  onApplyTemplate?: ((templateId: string) => void) | undefined;
  onEditTemplate?: ((templateId: string) => void) | undefined;
  onRenameTemplate?: ((templateId: string, name: string) => void) | undefined;
  onDeleteTemplate?: ((templateId: string) => void) | undefined;
}

/**
 * サイドバーのテンプレート列（v1.0 §5.1）。
 *
 * カテゴリー樹（`ActivityFilterList`）とは別枠のフラットな一覧。
 * カテゴリー分けは持たない（テンプレートはカテゴリーではなく「並べ方」を保存する）。
 *
 * Storybook-only: 実データ取得（tRPC）は後続の実装 issue で配線する。
 * ここでは `templates` を props で受け取るだけの表示専用コンポーネント。
 */
export function TemplateList({
  templates,
  onApplyTemplate,
  onEditTemplate,
  onRenameTemplate,
  onDeleteTemplate,
}: TemplateListProps) {
  const t = useTranslations();

  return (
    <SidebarSection title={t('calendar.templates.sectionTitle')} className="space-y-1">
      {templates.length === 0 ? (
        <p role="status" className="text-muted-foreground px-2 py-1 text-xs">
          {t('calendar.templates.empty')}
        </p>
      ) : (
        <div role="list" className="space-y-1">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              onApply={() => onApplyTemplate?.(template.id)}
              onEdit={() => onEditTemplate?.(template.id)}
              onRename={(name) => onRenameTemplate?.(template.id, name)}
              onDelete={() => onDeleteTemplate?.(template.id)}
            />
          ))}
        </div>
      )}
    </SidebarSection>
  );
}
