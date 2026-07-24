import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ListTimeblockContextOccupancyPageInput,
  TimeblockContextMarker,
  TimeblockContextOccupancyRow,
  TimeblockContextReadClient,
} from '../timeblock-context-client';
import { TIMEBLOCK_CONTEXT_MAX_ITEMS_PER_LANE } from '../timeblock-context-contract';
import {
  TIMEBLOCK_CONTEXT_READ_DEADLINE_MS,
  TimeblockContextService,
} from '../timeblock-context-service';

const range = {
  startDate: '2026-07-20T00:00:00+09:00',
  endDate: '2026-07-27T00:00:00+09:00',
};

const stableMarker: TimeblockContextMarker = {
  revision: '42',
  databaseNow: '2026-07-24T10:00:00.000Z',
  timezone: 'Asia/Tokyo',
};

function createRow(index: number): TimeblockContextOccupancyRow {
  return {
    id: `row-${String(index).padStart(5, '0')}`,
    startAt: '2026-07-24T10:00:00.000Z',
    endAt: '2026-07-24T11:00:00.000Z',
  };
}

function createClient(data?: {
  plans?: TimeblockContextOccupancyRow[];
  records?: TimeblockContextOccupancyRow[];
}) {
  const laneData = {
    plans: data?.plans ?? [],
    records: data?.records ?? [],
  };
  const getMarker = vi.fn<TimeblockContextReadClient['getMarker']>();
  const listOccupancyPage = vi.fn<TimeblockContextReadClient['listOccupancyPage']>(
    async (input: ListTimeblockContextOccupancyPageInput) =>
      laneData[input.lane].slice(input.offset, input.offset + input.limit),
  );
  const client: TimeblockContextReadClient = { getMarker, listOccupancyPage };
  return { client, getMarker, listOccupancyPage };
}

describe('TimeblockContextService.getConstraints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stable markerのDB時刻・timezone・最小occupancy・既存ruleを返す', async () => {
    const { client, getMarker, listOccupancyPage } = createClient({
      plans: [
        {
          id: 'earlier',
          startAt: '2026-07-24T09:00:00.000Z',
          endAt: '2026-07-24T10:00:00.000Z',
        },
        {
          id: 'earlier-end',
          startAt: '2026-07-24T10:00:00.000Z',
          endAt: '2026-07-24T11:00:00.000Z',
        },
        {
          id: 'later-end',
          startAt: '2026-07-24T10:00:00.000Z',
          endAt: '2026-07-24T12:00:00.000Z',
        },
      ],
    });
    getMarker.mockResolvedValue(stableMarker);

    const result = await new TimeblockContextService(client).getConstraints('user-1', range);

    expect(result).toMatchObject({
      asOf: stableMarker.databaseNow,
      timezone: 'Asia/Tokyo',
      range: { ...range, endExclusive: true },
      completeness: { complete: true, maxItemsPerLane: 5_000 },
      occupancy: {
        plans: [
          {
            startAt: '2026-07-24T09:00:00.000Z',
            endAt: '2026-07-24T10:00:00.000Z',
          },
          {
            startAt: '2026-07-24T10:00:00.000Z',
            endAt: '2026-07-24T11:00:00.000Z',
          },
          {
            startAt: '2026-07-24T10:00:00.000Z',
            endAt: '2026-07-24T12:00:00.000Z',
          },
        ],
        records: [],
      },
      rules: {
        intervalBoundary: '[)',
        overlap: {
          planVsPlan: 'forbidden',
          recordVsRecord: 'forbidden',
          planVsRecord: 'allowed',
        },
        plans: { skippedOccupiesLane: true },
        records: { linkedPlan: 'non_deleted_unskipped_completed' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('earlier-end');
    expect(JSON.stringify(result)).not.toContain('"id"');

    const signals = [
      ...getMarker.mock.calls.map((call) => call[1]),
      ...listOccupancyPage.mock.calls.map((call) => call[1]),
    ];
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(new Set(signals).size).toBe(1);
  });

  it('0件をcompleteとして返す', async () => {
    const { client, getMarker } = createClient();
    getMarker.mockResolvedValue(stableMarker);

    await expect(
      new TimeblockContextService(client).getConstraints('user-1', range),
    ).resolves.toMatchObject({
      completeness: { complete: true },
      occupancy: { plans: [], records: [] },
    });
  });

  it('複数pageのちょうど5,000件をtruncateせず返す', async () => {
    const plans = Array.from({ length: TIMEBLOCK_CONTEXT_MAX_ITEMS_PER_LANE }, (_, index) =>
      createRow(index),
    );
    const { client, getMarker, listOccupancyPage } = createClient({ plans });
    getMarker.mockResolvedValue(stableMarker);

    const result = await new TimeblockContextService(client).getConstraints('user-1', range);

    expect(result.occupancy.plans).toHaveLength(5_000);
    expect(listOccupancyPage.mock.calls.filter(([input]) => input.lane === 'plans')).toHaveLength(
      6,
    );
    expect(listOccupancyPage).toHaveBeenCalledWith(
      expect.objectContaining({ lane: 'plans', offset: 5_000, limit: 1 }),
      expect.any(AbortSignal),
    );
  });

  it('stable markerで5,001件目を検知した時はRANGE_TOO_DENSEにする', async () => {
    const plans = Array.from({ length: TIMEBLOCK_CONTEXT_MAX_ITEMS_PER_LANE + 1 }, (_, index) =>
      createRow(index),
    );
    const { client, getMarker } = createClient({ plans });
    getMarker.mockResolvedValue(stableMarker);

    await expect(
      new TimeblockContextService(client).getConstraints('user-1', range),
    ).rejects.toMatchObject({
      code: 'RANGE_TOO_DENSE',
    });
    expect(getMarker).toHaveBeenCalledTimes(2);
  });

  it('revisionが変われば全laneを一度だけ最初から読み直す', async () => {
    const { client, getMarker, listOccupancyPage } = createClient();
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
      new TimeblockContextService(client).getConstraints('user-1', range),
    ).resolves.toMatchObject({
      asOf: '2026-07-24T10:00:01.000Z',
    });
    expect(listOccupancyPage).toHaveBeenCalledTimes(4);
  });

  it('二回のattemptでtimezoneが変わればCONTEXT_CHANGEDにする', async () => {
    const { client, getMarker } = createClient();
    getMarker
      .mockResolvedValueOnce(stableMarker)
      .mockResolvedValueOnce({ ...stableMarker, timezone: 'UTC' })
      .mockResolvedValueOnce({ ...stableMarker, timezone: 'UTC' })
      .mockResolvedValueOnce({ ...stableMarker, timezone: 'America/New_York' });

    await expect(
      new TimeblockContextService(client).getConstraints('user-1', range),
    ).rejects.toMatchObject({
      code: 'CONTEXT_CHANGED',
    });
    expect(getMarker).toHaveBeenCalledTimes(4);
  });

  it('request cancellationを明示的なREQUEST_CANCELLEDへ変換する', async () => {
    const { client, getMarker, listOccupancyPage } = createClient();
    const controller = new AbortController();
    controller.abort();

    await expect(
      new TimeblockContextService(client).getConstraints('user-1', range, controller.signal),
    ).rejects.toMatchObject({
      code: 'REQUEST_CANCELLED',
    });
    expect(getMarker).not.toHaveBeenCalled();
    expect(listOccupancyPage).not.toHaveBeenCalled();
  });

  it('20秒deadline signalが実行中のmarker queryを中断する', async () => {
    const { client, getMarker, listOccupancyPage } = createClient();
    const deadline = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    getMarker.mockImplementation(
      (_userId, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    );

    try {
      const result = new TimeblockContextService(client).getConstraints('user-1', range);
      expect(timeoutSpy).toHaveBeenCalledWith(TIMEBLOCK_CONTEXT_READ_DEADLINE_MS);

      deadline.abort();

      await expect(result).rejects.toMatchObject({ code: 'READ_TIMEOUT' });
      expect(getMarker).toHaveBeenCalledOnce();
      expect(listOccupancyPage).not.toHaveBeenCalled();
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
