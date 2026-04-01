'use client';

import { useTranslations } from 'next-intl';

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { getTimeZones } from '@/lib/timezone-utils';
import { cn } from '@/lib/utils';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

/** TimezoneOffset コンポーネントのプロパティ */
interface TimezoneOffsetProps {
  className?: string;
}

/** タイムゾーンを選択するドロップダウンコンポーネント（UTC オフセット表示） */
export function TimezoneOffset({ className }: TimezoneOffsetProps) {
  const tActions = useTranslations('calendar.actions');
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const updateSettings = useCalendarSettingsStore((s) => s.updateSettings);
  const updateMutation = api.userSettings.update.useMutation();

  const getUTCOffset = (tz: string): string => {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      });
      const parts = formatter.formatToParts(now);
      const offsetPart = parts.find((part) => part.type === 'timeZoneName');

      if (offsetPart?.value) {
        const match = offsetPart.value.match(/GMT([+-]\d+)/);
        if (match && match[1]) {
          const offset = parseInt(match[1]);
          return offset >= 0 ? `+${offset}` : `${offset}`;
        }
      }

      const tzOffset = now
        .toLocaleString('en-US', {
          timeZone: tz,
          timeZoneName: 'shortOffset',
        })
        .match(/UTC([+-]\d+)/)?.[1];

      return tzOffset || '+0';
    } catch {
      return '+0';
    }
  };

  const handleTimezoneChange = (value: string) => {
    updateSettings({ timezone: value });
    updateMutation.mutate({ timezone: value });
  };

  const offset = getUTCOffset(timezone);

  return (
    <Select value={timezone} onValueChange={handleTimezoneChange}>
      <SelectTrigger
        variant="ghost"
        aria-label={tActions('selectTimezone')}
        className={cn(
          'text-muted-foreground h-auto justify-center px-1 py-1 text-xs [&_svg]:hidden',
          className,
        )}
      >
        <span className="font-normal">UTC{offset}</span>
      </SelectTrigger>
      <SelectContent>
        {getTimeZones().map((tz) => (
          <SelectItem key={tz.value} value={tz.value}>
            {tz.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
