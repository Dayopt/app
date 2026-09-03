'use client';

import { useState } from 'react';

import { Plus, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SidebarSection } from '@/components/shell/sidebar';
import { Button, HoverTooltip } from '@dayopt/components';

import { TemplateRow } from './TemplateRow';
import type { TemplateMock } from './types';

interface TemplateListProps {
  templates: ReadonlyArray<TemplateMock>;
  onApplyTemplate?: ((templateId: string) => void) | undefined;
  onEditTemplate?: ((templateId: string) => void) | undefined;
  onRenameTemplate?: ((templateId: string, name: string) => void) | undefined;
  onDeleteTemplate?: ((templateId: string) => void) | undefined;
  /** 見出しの「+」（カテゴリ / 未分類と同じ hover アクション）。実配線は #2567。 */
  onCreateEntry?: (() => void) | undefined;
  /** 見出しの歯車（カテゴリ / 未分類と同じ hover アクション）。実配線は #2567。 */
  onOpenSettings?: (() => void) | undefined;
}

/**
 * サイドバーのテンプレート列（v1.0 §5.1）。
 *
 * カテゴリー樹（`ActivityFilterList`）とは別枠のフラットな一覧。
 * カテゴリー分けは持たない（テンプレートはカテゴリーではなく「並べ方」を保存する）。
 *
 * 見出しの hover アクション（+ / 歯車）は「カテゴリ」「未分類」と同じ視覚パターンで
 * 先に置く。中身（作成導線・設定内容）は #2567 で配線するため、現状 `onCreateEntry` /
 * `onOpenSettings` を渡さなければ何も起きない（見た目だけ先行）。
 *
 * データ取得（tRPC）は #2567 で配線する。ここでは `templates` を props で
 * 受け取るだけの表示専用コンポーネント。
 */
export function TemplateList({
  templates,
  onApplyTemplate,
  onEditTemplate,
  onRenameTemplate,
  onDeleteTemplate,
  onCreateEntry,
  onOpenSettings,
}: TemplateListProps) {
  const t = useTranslations();
  // 開閉状態。カテゴリ・未分類と同じく既定は展開
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SidebarSection
      title={t('calendar.templates.sectionTitle')}
      className="space-y-1"
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((prev) => !prev)}
      action={
        // 常時は隠し、見出し行にホバー / フォーカスした時だけ出す
        // （「未分類」の action と同じ visibility パターン）
        <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover/section:opacity-100 group-has-[:focus-visible]/section:opacity-100 has-[:focus-visible]:opacity-100 [@media(hover:none)]:opacity-100">
          <HoverTooltip content={t('calendar.templates.createEntryLabel')} side="top">
            <Button
              variant="ghost"
              icon
              className="size-6"
              aria-label={t('calendar.templates.createEntryLabel')}
              onClick={() => onCreateEntry?.()}
            >
              <Plus className="size-4" />
            </Button>
          </HoverTooltip>
          <HoverTooltip content={t('calendar.templates.settingsLabel')} side="top">
            <Button
              variant="ghost"
              icon
              className="size-6"
              aria-label={t('calendar.templates.settingsLabel')}
              onClick={() => onOpenSettings?.()}
            >
              <Settings2 className="size-4" />
            </Button>
          </HoverTooltip>
        </span>
      }
    >
      {templates.length === 0 ? (
        <p role="status" className="text-foreground px-2 py-1 text-xs">
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
