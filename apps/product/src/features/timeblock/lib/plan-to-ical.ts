/**
 * Timeblock[] → iCalendar 文字列変換
 *
 * RFC 5545 準拠の VCALENDAR を生成。
 * Google Calendar / Apple Calendar などで購読可能。
 */

import { dayoptDomains } from '@dayopt/config';

interface ICalEntry {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string | null;
  updated_at: string | null;
  tag_name: string | null;
}

/**
 * iCalendar のテキスト値をエスケープする
 * RFC 5545 Section 3.3.11
 */
function escapeICalText(text: string): string {
  return text
    .replace(/\r\n|\r/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * ISO日時をiCalendar形式（UTC）に変換
 * 例: "2026-03-17T09:00:00+09:00" → "20260317T000000Z"
 */
function toICalDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * 長い行を75オクテットで折り返す（RFC 5545 Section 3.1）
 */
function foldLine(line: string): string {
  const MAX_OCTETS = 75;
  if (line.length <= MAX_OCTETS) return line;

  const parts: string[] = [line.slice(0, MAX_OCTETS)];
  let pos = MAX_OCTETS;
  while (pos < line.length) {
    parts.push(' ' + line.slice(pos, pos + MAX_OCTETS - 1));
    pos += MAX_OCTETS - 1;
  }
  return parts.join('\r\n');
}

/**
 * Timeblock配列からiCalendar文字列を生成
 */
export function plansToICal(entries: ICalEntry[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dayopt//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Dayopt',
  ];

  for (const entry of entries) {
    if (!entry.start_time || !entry.end_time) continue;

    const summary = entry.tag_name ?? entry.title;
    const uid = `${entry.id}@${dayoptDomains.marketing}`;

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${uid}`));
    lines.push(`DTSTART:${toICalDateTime(entry.start_time)}`);
    lines.push(`DTEND:${toICalDateTime(entry.end_time)}`);
    lines.push(foldLine(`SUMMARY:${escapeICalText(summary)}`));

    if (entry.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeICalText(entry.description)}`));
    }

    if (entry.created_at) {
      lines.push(`DTSTAMP:${toICalDateTime(entry.created_at)}`);
    }

    if (entry.updated_at) {
      lines.push(`LAST-MODIFIED:${toICalDateTime(entry.updated_at)}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}
