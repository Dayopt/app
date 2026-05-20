import { describe, expect, it } from 'vitest';

import { entriesToICal } from '../entry-to-ical';

interface ICalEntryInput {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string | null;
  updated_at: string | null;
  tag_name: string | null;
}

function makeEntry(overrides: Partial<ICalEntryInput> & { id: string }): ICalEntryInput {
  return {
    title: 'Sample',
    description: null,
    start_time: '2026-04-27T01:00:00.000Z',
    end_time: '2026-04-27T02:00:00.000Z',
    created_at: '2026-04-26T00:00:00.000Z',
    updated_at: '2026-04-26T00:00:00.000Z',
    tag_name: null,
    ...overrides,
  };
}

describe('entriesToICal', () => {
  describe('VCALENDAR エンベロープ', () => {
    it('BEGIN:VCALENDAR / END:VCALENDAR で囲まれる', () => {
      const ical = entriesToICal([]);
      expect(ical).toMatch(/^BEGIN:VCALENDAR\r\n/);
      expect(ical).toMatch(/END:VCALENDAR\r\n$/);
    });

    it('必須ヘッダ（VERSION / PRODID / CALSCALE / METHOD / X-WR-CALNAME）を含む', () => {
      const ical = entriesToICal([]);
      expect(ical).toContain('VERSION:2.0');
      expect(ical).toContain('PRODID:-//Dayopt//Calendar Feed//EN');
      expect(ical).toContain('CALSCALE:GREGORIAN');
      expect(ical).toContain('METHOD:PUBLISH');
      expect(ical).toContain('X-WR-CALNAME:Dayopt');
    });

    it('行末は CRLF で区切られる（RFC 5545 Section 3.1）', () => {
      const ical = entriesToICal([]);
      expect(ical.split('\r\n').length).toBeGreaterThan(1);
      // CR を含まない LF のみは存在しない
      expect(ical).not.toMatch(/[^\r]\n/);
    });
  });

  describe('VEVENT 生成', () => {
    it('start_time / end_time が揃ったエントリは VEVENT に含まれる', () => {
      const ical = entriesToICal([makeEntry({ id: 'e1', title: 'Meeting' })]);
      expect(ical).toContain('BEGIN:VEVENT');
      expect(ical).toContain('END:VEVENT');
      expect(ical).toContain('UID:e1@dayopt.app');
      expect(ical).toContain('SUMMARY:Meeting');
    });

    it('start_time / end_time のいずれかが null なら VEVENT を生成しない', () => {
      const ical = entriesToICal([
        makeEntry({ id: 'no-start', start_time: null }),
        makeEntry({ id: 'no-end', end_time: null }),
      ]);
      expect(ical).not.toContain('BEGIN:VEVENT');
    });

    it('複数エントリは順序通りに VEVENT として並ぶ', () => {
      const ical = entriesToICal([
        makeEntry({ id: 'a', title: 'A' }),
        makeEntry({ id: 'b', title: 'B' }),
      ]);
      const aIndex = ical.indexOf('UID:a@dayopt.app');
      const bIndex = ical.indexOf('UID:b@dayopt.app');
      expect(aIndex).toBeGreaterThan(0);
      expect(bIndex).toBeGreaterThan(aIndex);
    });
  });

  describe('日時変換（toICalDateTime）', () => {
    it('ISO 文字列を YYYYMMDDTHHMMSSZ 形式に変換する', () => {
      const ical = entriesToICal([
        makeEntry({
          id: 'e1',
          start_time: '2026-03-17T09:00:00+09:00',
          end_time: '2026-03-17T10:00:00+09:00',
        }),
      ]);
      // JST 09:00 = UTC 00:00
      expect(ical).toContain('DTSTART:20260317T000000Z');
      expect(ical).toContain('DTEND:20260317T010000Z');
    });

    it('UTC 入力もそのまま UTC として出力される', () => {
      const ical = entriesToICal([
        makeEntry({
          id: 'e1',
          start_time: '2026-04-27T01:00:00.000Z',
          end_time: '2026-04-27T02:00:00.000Z',
        }),
      ]);
      expect(ical).toContain('DTSTART:20260427T010000Z');
      expect(ical).toContain('DTEND:20260427T020000Z');
    });
  });

  describe('SUMMARY: tag_name を優先', () => {
    it('tag_name が存在すれば SUMMARY は tag_name を使う', () => {
      const ical = entriesToICal([
        makeEntry({ id: 'e1', title: 'Meeting', tag_name: 'Deep Work' }),
      ]);
      expect(ical).toContain('SUMMARY:Deep Work');
      expect(ical).not.toContain('SUMMARY:Meeting');
    });

    it('tag_name が null なら title を使う', () => {
      const ical = entriesToICal([makeEntry({ id: 'e1', title: 'Meeting', tag_name: null })]);
      expect(ical).toContain('SUMMARY:Meeting');
    });
  });

  describe('escapeICalText（RFC 5545 Section 3.3.11）', () => {
    it('セミコロン / カンマ / 改行 / バックスラッシュをエスケープする', () => {
      const ical = entriesToICal([
        makeEntry({
          id: 'e1',
          title: 'a;b,c\nd\\e',
        }),
      ]);
      expect(ical).toContain('SUMMARY:a\\;b\\,c\\nd\\\\e');
    });

    it('description にも同じエスケープを適用する', () => {
      const ical = entriesToICal([
        makeEntry({
          id: 'e1',
          description: 'line1\nline2; with comma,',
        }),
      ]);
      expect(ical).toContain('DESCRIPTION:line1\\nline2\\; with comma\\,');
    });

    it('バックスラッシュは他の文字より先にエスケープされる（二重エスケープ防止）', () => {
      // \ → \\ は最初に処理される必要がある
      // もし , を先に処理すると \, が \\\, になってしまう
      const ical = entriesToICal([makeEntry({ id: 'e1', title: '\\' })]);
      expect(ical).toContain('SUMMARY:\\\\');
      // \\\\ は出現するが \\\\\\ は出現しない（過剰エスケープを防ぐ）
      expect(ical).not.toMatch(/SUMMARY:\\\\\\\\/);
    });

    it('description が null の場合は DESCRIPTION 行を出さない', () => {
      const ical = entriesToICal([makeEntry({ id: 'e1', description: null })]);
      expect(ical).not.toContain('DESCRIPTION:');
    });
  });

  describe('foldLine（75 オクテット折返）', () => {
    it('75 文字以下の行は折り返さない', () => {
      const ical = entriesToICal([makeEntry({ id: 'short', title: 'A' })]);
      // SUMMARY:A は 9 文字 → 折返なし
      expect(ical).toContain('SUMMARY:A\r\n');
    });

    it('長い title は折り返される（次行は半角スペースで始まる）', () => {
      const longTitle = 'a'.repeat(200);
      const ical = entriesToICal([makeEntry({ id: 'long', title: longTitle })]);

      const summaryStart = ical.indexOf('SUMMARY:');
      const summarySection = ical.slice(summaryStart);
      // 折返後の続行は CRLF + space で始まる
      expect(summarySection).toMatch(/\r\n /);
    });

    it('UID が長い場合（理論上は短いが）も折返処理が適用される', () => {
      const longId = 'x'.repeat(200);
      const ical = entriesToICal([makeEntry({ id: longId })]);
      const uidStart = ical.indexOf('UID:');
      const uidSection = ical.slice(uidStart);
      expect(uidSection).toMatch(/\r\n /);
    });
  });

  describe('DTSTAMP / LAST-MODIFIED は値があるときだけ出力', () => {
    it('created_at が null なら DTSTAMP を出さない', () => {
      const ical = entriesToICal([makeEntry({ id: 'e1', created_at: null })]);
      expect(ical).not.toContain('DTSTAMP:');
    });

    it('updated_at が null なら LAST-MODIFIED を出さない', () => {
      const ical = entriesToICal([makeEntry({ id: 'e1', updated_at: null })]);
      expect(ical).not.toContain('LAST-MODIFIED:');
    });

    it('両方あれば両方出力する', () => {
      const ical = entriesToICal([
        makeEntry({
          id: 'e1',
          created_at: '2026-04-26T00:00:00.000Z',
          updated_at: '2026-04-26T05:00:00.000Z',
        }),
      ]);
      expect(ical).toContain('DTSTAMP:20260426T000000Z');
      expect(ical).toContain('LAST-MODIFIED:20260426T050000Z');
    });
  });

  it('空配列はカレンダーエンベロープのみ返す', () => {
    const ical = entriesToICal([]);
    expect(ical).not.toContain('BEGIN:VEVENT');
    expect(ical).toContain('BEGIN:VCALENDAR');
    expect(ical).toContain('END:VCALENDAR');
  });
});
