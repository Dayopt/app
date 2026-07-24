import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TimeblockContextMarker } from '../timeblock-context-client';
import type {
  ListTimeblockReviewPageInput,
  TimeblockReviewReadClient,
  TimeblockReviewRow,
} from '../timeblock-review-client';
import { TIMEBLOCK_REVIEW_MAX_TAGS } from '../timeblock-review-contract';
import {
  TIMEBLOCK_REVIEW_READ_DEADLINE_MS,
  TimeblockReviewService,
} from '../timeblock-review-service';

const range = {
  startDate: '2026-07-20T00:00:00+09:00',
  endDate: '2026-07-27T00:00:00+09:00',
};

const stableMarker: TimeblockContextMarker = {
  revision: '42',
  databaseNow: '2026-07-24T10:00:00.000Z',
  timezone: 'Asia/Tokyo',
};

function tagId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function createRow(index: number, tag = tagId(1)): TimeblockReviewRow {
  return {
    id: `row-${String(index).padStart(5, '0')}`,
    tagId: tag,
    startAt: '2026-07-24T10:00:00.000Z',
    endAt: '2026-07-24T11:00:00.000Z',
  };
}

function createClient(data?: { plans?: TimeblockReviewRow[]; records?: TimeblockReviewRow[] }) {
  const laneData = {
    plans: data?.plans ?? [],
    records: data?.records ?? [],
  };
  const getMarker = vi.fn<TimeblockReviewReadClient['getMarker']>();
  const listReviewPage = vi.fn<TimeblockReviewReadClient['listReviewPage']>(
    async (input: ListTimeblockReviewPageInput) => ({
      rows: laneData[input.lane].slice(input.offset, input.offset + input.limit),
      totalCount: input.offset === 0 ? laneData[input.lane].length : null,
    }),
  );
  const client: TimeblockReviewReadClient = { getMarker, listReviewPage };
  return { client, getMarker, listReviewPage };
}

describe('TimeblockReviewService.getMcpReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stable markerのDB時刻・timezoneと最小review契約を返す', async () => {
    const { client, getMarker, listReviewPage } = createClient({
      plans: [createRow(1)],
      records: [
        {
          ...createRow(2),
          endAt: '2026-07-24T10:30:00.000Z',
        },
      ],
    });
    getMarker.mockResolvedValue(stableMarker);

    const result = await new TimeblockReviewService(client).getMcpReview('user-1', range);

    expect(result).toMatchObject({
      asOf: stableMarker.databaseNow,
      period: {
        ...range,
        endExclusive: true,
        timezone: 'Asia/Tokyo',
      },
      basis: {
        planMeaning: 'budget',
        recordMeaning: 'actual',
        rowFilter: 'active_tagged_start_in_period',
        durationBoundary: 'full_row_not_clipped',
        periodBoundary: '[)',
        varianceConvention: 'planned_minus_recorded',
      },
      hasData: true,
      summary: {
        plannedMinutes: 60,
        recordedMinutes: 30,
        varianceMinutes: 30,
      },
      accuracy: { rate: 0.5, status: 'poor' },
    });
    expect(JSON.stringify(result)).not.toContain('row-');

    const signals = [
      ...getMarker.mock.calls.map((call) => call[1]),
      ...listReviewPage.mock.calls.map((call) => call[1]),
    ];
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(new Set(signals).size).toBe(1);
  });

  it('0件をcompleteなempty reviewとして返す', async () => {
    const { client, getMarker } = createClient();
    getMarker.mockResolvedValue(stableMarker);

    await expect(
      new TimeblockReviewService(client).getMcpReview('user-1', range),
    ).resolves.toMatchObject({
      hasData: false,
      summary: { plannedMinutes: 0, recordedMinutes: 0, varianceMinutes: 0 },
      accuracy: null,
      tags: [],
      signals: [],
    });
  });

  it('exact countに従い複数pageのちょうど5,000件を欠落なく読む', async () => {
    const plans = Array.from({ length: 5_000 }, (_, index) => createRow(index));
    const { client, getMarker, listReviewPage } = createClient({ plans });
    getMarker.mockResolvedValue(stableMarker);

    const result = await new TimeblockReviewService(client).getMcpReview('user-1', range);

    expect(result.summary.plannedMinutes).toBe(300_000);
    expect(listReviewPage.mock.calls.filter(([input]) => input.lane === 'plans')).toHaveLength(5);
    expect(listReviewPage).toHaveBeenCalledWith(
      expect.objectContaining({ lane: 'plans', offset: 4_000, limit: 1_000 }),
      expect.any(AbortSignal),
    );
  });

  it('stable markerで5,001件目を検知した時はRANGE_TOO_DENSEにする', async () => {
    const plans = Array.from({ length: 5_001 }, (_, index) => createRow(index));
    const { client, getMarker, listReviewPage } = createClient({ plans });
    getMarker.mockResolvedValue(stableMarker);

    await expect(
      new TimeblockReviewService(client).getMcpReview('user-1', range),
    ).rejects.toMatchObject({ code: 'RANGE_TOO_DENSE' });
    expect(listReviewPage).toHaveBeenCalledWith(
      expect.objectContaining({ lane: 'plans', offset: 5_000, limit: 1 }),
      expect.any(AbortSignal),
    );
    expect(getMarker).toHaveBeenCalledTimes(2);
  });

  it('exact countより短いpageをcompleteとして返さない', async () => {
    const { client, getMarker, listReviewPage } = createClient();
    getMarker.mockResolvedValue(stableMarker);
    listReviewPage.mockResolvedValue({
      rows: [createRow(1)],
      totalCount: 2,
    });

    await expect(
      new TimeblockReviewService(client).getMcpReview('user-1', range),
    ).rejects.toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Timeblock review page was incomplete',
    });
    expect(getMarker).toHaveBeenCalledTimes(2);
  });

  it('short page中にrevisionが変われば両laneを一度だけ読み直す', async () => {
    const { client, getMarker, listReviewPage } = createClient();
    getMarker
      .mockResolvedValueOnce(stableMarker)
      .mockResolvedValueOnce({ ...stableMarker, revision: '43' })
      .mockResolvedValueOnce({ ...stableMarker, revision: '43' })
      .mockResolvedValueOnce({ ...stableMarker, revision: '43' });
    let firstPlanPage = true;
    listReviewPage.mockImplementation(async (input) => {
      if (input.lane === 'plans' && firstPlanPage) {
        firstPlanPage = false;
        return { rows: [createRow(1)], totalCount: 2 };
      }
      return { rows: [], totalCount: input.offset === 0 ? 0 : null };
    });

    await expect(
      new TimeblockReviewService(client).getMcpReview('user-1', range),
    ).resolves.toMatchObject({
      hasData: false,
      tags: [],
    });
    expect(getMarker).toHaveBeenCalledTimes(4);
    expect(listReviewPage).toHaveBeenCalledTimes(4);
  });

  it('distinct tagが公開上限ちょうどならcomplete reviewを返す', async () => {
    const plans = Array.from({ length: TIMEBLOCK_REVIEW_MAX_TAGS }, (_, index) =>
      createRow(index, tagId(index + 1)),
    );
    const { client, getMarker } = createClient({ plans });
    getMarker.mockResolvedValue(stableMarker);

    const result = await new TimeblockReviewService(client).getMcpReview('user-1', range);

    expect(result.hasData).toBe(true);
    expect(result.tags).toHaveLength(TIMEBLOCK_REVIEW_MAX_TAGS);
  });

  it('distinct tagが公開上限を超えた時は巨大responseを返さない', async () => {
    const plans = Array.from({ length: TIMEBLOCK_REVIEW_MAX_TAGS + 1 }, (_, index) =>
      createRow(index, tagId(index + 1)),
    );
    const { client, getMarker } = createClient({ plans });
    getMarker.mockResolvedValue(stableMarker);

    await expect(
      new TimeblockReviewService(client).getMcpReview('user-1', range),
    ).rejects.toMatchObject({ code: 'RANGE_TOO_DENSE' });
  });

  it('revisionが変われば両laneを一度だけ最初から読み直す', async () => {
    const { client, getMarker, listReviewPage } = createClient();
    getMarker
      .mockResolvedValueOnce(stableMarker)
      .mockResolvedValueOnce({ ...stableMarker, revision: '43' })
      .mockResolvedValueOnce({ ...stableMarker, revision: '43' })
      .mockResolvedValueOnce({
        ...stableMarker,
        revision: '43',
        databaseNow: '2026-07-24T10:00:01.000Z',
      });

    await expect(
      new TimeblockReviewService(client).getMcpReview('user-1', range),
    ).resolves.toMatchObject({
      asOf: '2026-07-24T10:00:01.000Z',
    });
    expect(listReviewPage).toHaveBeenCalledTimes(4);
  });

  it('二回のattemptでtimezoneが変わればCONTEXT_CHANGEDにする', async () => {
    const { client, getMarker } = createClient();
    getMarker
      .mockResolvedValueOnce(stableMarker)
      .mockResolvedValueOnce({ ...stableMarker, timezone: 'UTC' })
      .mockResolvedValueOnce({ ...stableMarker, timezone: 'UTC' })
      .mockResolvedValueOnce({ ...stableMarker, timezone: 'America/New_York' });

    await expect(
      new TimeblockReviewService(client).getMcpReview('user-1', range),
    ).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    expect(getMarker).toHaveBeenCalledTimes(4);
  });

  it('request cancellationを明示的なREQUEST_CANCELLEDへ変換する', async () => {
    const { client, getMarker, listReviewPage } = createClient();
    const controller = new AbortController();
    controller.abort();

    await expect(
      new TimeblockReviewService(client).getMcpReview('user-1', range, controller.signal),
    ).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    expect(getMarker).not.toHaveBeenCalled();
    expect(listReviewPage).not.toHaveBeenCalled();
  });

  it('20秒deadline signalが実行中のmarker queryを中断する', async () => {
    const { client, getMarker, listReviewPage } = createClient();
    const deadline = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    getMarker.mockImplementation(
      (_userId, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    );

    try {
      const result = new TimeblockReviewService(client).getMcpReview('user-1', range);
      expect(timeoutSpy).toHaveBeenCalledWith(TIMEBLOCK_REVIEW_READ_DEADLINE_MS);

      deadline.abort();

      await expect(result).rejects.toMatchObject({ code: 'READ_TIMEOUT' });
      expect(getMarker).toHaveBeenCalledOnce();
      expect(listReviewPage).not.toHaveBeenCalled();
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
