type TimeModelReviewDiffKind = 'recorded' | 'skipped' | 'unplanned' | 'unrecorded';

interface TimeModelReviewDiffResult {
  summary: {
    plannedMinutes: number;
    actualMinutes: number;
    diffMinutes: number;
    unplannedMinutes: number;
    unrecordedMinutes: number;
  };
  items: Array<{
    id: string;
    kind: TimeModelReviewDiffKind;
    title: string;
    tagId: string | null;
    color: string;
    planId: string | null;
    plannedMinutes: number;
    actualMinutes: number;
    diffMinutes: number;
    sortTime: number;
  }>;
}

/** Calendar の新差分を Review が消費する表示契約へ固定する。 */
export function toTimeModelReviewDiff(
  result: TimeModelReviewDiffResult,
): TimeModelReviewDiffResult {
  return { summary: result.summary, items: result.items };
}
