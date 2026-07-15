import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@dayopt/components';

import { getTimeZones } from '@/lib/timezone-utils';

import { LabeledRow } from '@/components/ui/display/LabeledRow';
import { SectionCard } from '@/components/ui/display/SectionCard';

// ─────────────────────────────────────────────────────────
// Demo Components
// ─────────────────────────────────────────────────────────

const TIMEZONES = getTimeZones();

/**
 * 表示設定の全セクション（実際の display-settings.tsx と同一構成）
 *
 * Section 1: 言語とテーマ
 * Section 2: 時間とタイムゾーン
 * Section 3: デフォルトビュー
 */
function DisplaySettingsDemo() {
  const [language, setLanguage] = useState('ja');
  const [theme, setTheme] = useState('dark');
  const [timezone, setTimezone] = useState('Asia/Tokyo');
  const [timeFormat, setTimeFormat] = useState('24h');
  const [dateFormat, setDateFormat] = useState('yyyy/MM/dd');
  const [weekStartsOn, setWeekStartsOn] = useState('1');
  const [defaultView, setDefaultView] = useState('week');
  const [defaultDuration, setDefaultDuration] = useState('60');
  const [showWeekends, setShowWeekends] = useState(true);
  const [showWeekNumbers, setShowWeekNumbers] = useState(false);
  const [density, setDensity] = useState('default');

  return (
    <div className="max-w-2xl space-y-8">
      {/* Section 1: 言語とテーマ */}
      <SectionCard title="言語とテーマ">
        <LabeledRow label="言語">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ja">日本語</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label="テーマ">
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">システム</SelectItem>
              <SelectItem value="light">ライト</SelectItem>
              <SelectItem value="dark">ダーク</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
      </SectionCard>

      {/* Section 2: 時間とタイムゾーン */}
      <SectionCard title="時間とタイムゾーン">
        <LabeledRow label="タイムゾーン">
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label="時間表示形式">
          <Select value={timeFormat} onValueChange={setTimeFormat}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24時間表記 (13:00)</SelectItem>
              <SelectItem value="12h">12時間表記 (1:00 PM)</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label="日付表示形式">
          <Select value={dateFormat} onValueChange={setDateFormat}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yyyy/MM/dd">年/月/日 (2025/12/15)</SelectItem>
              <SelectItem value="MM/dd/yyyy">月/日/年 (12/15/2025)</SelectItem>
              <SelectItem value="dd/MM/yyyy">日/月/年 (15/12/2025)</SelectItem>
              <SelectItem value="yyyy-MM-dd">ISO (2025-12-15)</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label="週の開始曜日">
          <Select value={weekStartsOn} onValueChange={setWeekStartsOn}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">日曜日</SelectItem>
              <SelectItem value="1">月曜日</SelectItem>
              <SelectItem value="6">土曜日</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
      </SectionCard>

      {/* Section 3: デフォルトビュー */}
      <SectionCard title="デフォルトビュー">
        <LabeledRow label="起動時のビュー">
          <Select value={defaultView} onValueChange={setDefaultView}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">日表示</SelectItem>
              <SelectItem value="3day">3日間</SelectItem>
              <SelectItem value="5day">5日間</SelectItem>
              <SelectItem value="week">週表示</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label="デフォルト時間">
          <Select value={defaultDuration} onValueChange={setDefaultDuration}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15分</SelectItem>
              <SelectItem value="30">30分</SelectItem>
              <SelectItem value="60">1時間</SelectItem>
              <SelectItem value="90">1時間30分</SelectItem>
              <SelectItem value="120">2時間</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label="週末を表示">
          <Switch
            checked={showWeekends}
            onCheckedChange={setShowWeekends}
            aria-label="Show weekends"
          />
        </LabeledRow>
        <LabeledRow label="週番号を表示">
          <Switch
            checked={showWeekNumbers}
            onCheckedChange={setShowWeekNumbers}
            aria-label="Show week numbers"
          />
        </LabeledRow>
        <LabeledRow label="密度">
          <Select value={density} onValueChange={setDensity}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">コンパクト</SelectItem>
              <SelectItem value="default">標準</SelectItem>
              <SelectItem value="spacious">ゆったり</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Timezone List Reference
// ─────────────────────────────────────────────────────────

function TimezoneListReference() {
  return (
    <div className="max-w-2xl">
      <SectionCard title="対応タイムゾーン一覧 (17ゾーン)">
        {TIMEZONES.map((tz) => (
          <div key={tz.value} className="flex items-center justify-between px-2 py-2">
            <span className="text-foreground text-sm">{tz.label}</span>
            <code className="text-muted-foreground text-xs">{tz.value}</code>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Meta & Stories
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Product/Features/Settings/DisplaySettingsPatterns',
  parameters: {
    layout: 'padded',
    // button-name: SelectTrigger inside LabeledRow without explicit aria-label
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** 表示設定 全セクション（display-settings.tsx と同一構成） */
export const AllSections: Story = {
  render: () => <DisplaySettingsDemo />,
};

/** 対応タイムゾーン一覧（リファレンス） */
export const TimezoneList: Story = {
  render: () => <TimezoneListReference />,
};
