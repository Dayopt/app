export interface TagDashboardTagRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface TagDashboardEntryRow {
  id: string;
  title: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  tag_id: string | null;
}

interface TagDashboardInput {
  tag: TagDashboardTagRow;
  rows: TagDashboardEntryRow[];
  limit: number;
  timezone: string;
}

function diffMinutes(start: string | null, end: string | null): number {
  if (start == null || end == null) return 0;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 60000));
}

function dateKeyInTimezone(value: string | null, timezone: string): string {
  if (value == null) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : value.slice(0, 10);
}

export function buildTagDashboard({ tag, rows, limit, timezone }: TagDashboardInput) {
  const dailyMap = new Map<
    string,
    { date: string; plannedMinutes: number; actualMinutes: number }
  >();

  let totalPlannedMinutes = 0;
  let totalActualMinutes = 0;

  const computedRows = rows.map((row) => {
    const plannedMinutes = diffMinutes(row.start_time, row.end_time);
    const actualMinutes = diffMinutes(row.actual_start_time, row.actual_end_time);
    const date = dateKeyInTimezone(row.actual_start_time ?? row.start_time, timezone);

    if (date !== '') {
      const daily = dailyMap.get(date) ?? { date, plannedMinutes: 0, actualMinutes: 0 };
      daily.plannedMinutes += plannedMinutes;
      daily.actualMinutes += actualMinutes;
      dailyMap.set(date, daily);
    }

    totalPlannedMinutes += plannedMinutes;
    totalActualMinutes += actualMinutes;

    return {
      row,
      date,
      plannedMinutes,
      actualMinutes,
      diffMinutes: actualMinutes - plannedMinutes,
    };
  });

  return {
    tag,
    summary: {
      totalMinutes: totalActualMinutes,
      plannedMinutes: totalPlannedMinutes,
      actualMinutes: totalActualMinutes,
      diffMinutes: totalActualMinutes - totalPlannedMinutes,
      entryCount: rows.length,
    },
    dailyRows: Array.from(dailyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({
        ...row,
        diffMinutes: row.actualMinutes - row.plannedMinutes,
      })),
    entries: computedRows
      .sort((a, b) => {
        const aTime = new Date(a.row.actual_start_time ?? a.row.start_time ?? 0).getTime();
        const bTime = new Date(b.row.actual_start_time ?? b.row.start_time ?? 0).getTime();
        return bTime - aTime;
      })
      .slice(0, limit)
      .map((entry) => ({
        entryId: entry.row.id,
        date: entry.date,
        title: entry.row.title,
        description: entry.row.description,
        startTime: entry.row.start_time,
        endTime: entry.row.end_time,
        actualStartTime: entry.row.actual_start_time,
        actualEndTime: entry.row.actual_end_time,
        plannedMinutes: entry.plannedMinutes,
        actualMinutes: entry.actualMinutes,
        diffMinutes: entry.diffMinutes,
        tag: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
        },
      })),
  };
}
