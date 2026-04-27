import { describe, expect, it, vi } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

import { createMockEntry } from '@/lib/test/factories';

import { EntryService, EntryServiceError } from '../entry-service';
import type { ServiceSupabaseClient } from '../types';

// ============================================================================
// Helpers
// ============================================================================

function createService(mockSupabase = createMockSupabase()) {
  return {
    service: new EntryService(mockSupabase as unknown as ServiceSupabaseClient),
    mockSupabase,
  };
}

const USER_ID = 'test-user-id';

// ============================================================================
// create
// ============================================================================

describe('EntryService.create', () => {
  it('基本的なエントリ作成が成功する', async () => {
    const entry = createMockEntry({ title: 'New Entry' });
    const mock = createChainableMock(entry);
    const { service, mockSupabase } = createService();
    mockSupabase.from.mockReturnValue(mock);

    const result = await service.create({
      userId: USER_ID,
      input: { title: 'New Entry' },
    });

    expect(result.title).toBe('New Entry');
  });

  it('重複チェック有効時にアプリレベルで TIME_OVERLAP を返す', async () => {
    const { service, mockSupabase } = createService();

    // checkTimeOverlap 用: 重複あり（actual未記録 → 予定時間で判定）
    const overlapMock = createChainableMock([
      {
        id: 'existing-entry',
        start_time: '2026-03-17T10:00:00Z',
        end_time: '2026-03-17T11:00:00Z',
        actual_start_time: null,
        actual_end_time: null,
      },
    ]);
    // create 用（呼ばれないはず）
    const insertMock = createChainableMock(createMockEntry());

    let callCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'entries') {
        callCount++;
        // 1回目: overlap check SELECT
        if (callCount === 1) return overlapMock;
        // 2回目: INSERT（到達しないはず）
        return insertMock;
      }
      return createChainableMock([]);
    });

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Overlapping',
          start_time: '2026-03-17T10:00:00Z',
          end_time: '2026-03-17T11:00:00Z',
        },
        preventOverlappingEntries: true,
      }),
    ).rejects.toThrow(EntryServiceError);

    try {
      await service.create({
        userId: USER_ID,
        input: {
          title: 'Overlapping',
          start_time: '2026-03-17T10:00:00Z',
          end_time: '2026-03-17T11:00:00Z',
        },
        preventOverlappingEntries: true,
      });
    } catch (e) {
      expect((e as EntryServiceError).code).toBe('TIME_OVERLAP');
    }
  });

  it('DB exclusion constraint violation で TIME_OVERLAP を返す', async () => {
    const { service, mockSupabase } = createService();

    // INSERT が exclusion violation を返す
    const insertMock = createChainableMock(null, {
      message: 'conflicting key value violates exclusion constraint',
      code: '23P01',
    });

    mockSupabase.from.mockReturnValue(insertMock);

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Conflict',
          start_time: '2026-03-17T10:00:00Z',
          end_time: '2026-03-17T11:00:00Z',
        },
      }),
    ).rejects.toThrow(EntryServiceError);

    try {
      await service.create({
        userId: USER_ID,
        input: {
          title: 'Conflict',
          start_time: '2026-03-17T10:00:00Z',
          end_time: '2026-03-17T11:00:00Z',
        },
      });
    } catch (e) {
      expect((e as EntryServiceError).code).toBe('TIME_OVERLAP');
    }
  });

  it('重複チェック無効かつ時間なしで制約チェックをスキップする', async () => {
    const entry = createMockEntry({ title: 'No Time' });
    const mock = createChainableMock(entry);
    const { service, mockSupabase } = createService();
    mockSupabase.from.mockReturnValue(mock);

    const result = await service.create({
      userId: USER_ID,
      input: { title: 'No Time' },
    });

    expect(result.title).toBe('No Time');
  });
});

// ============================================================================
// update
// ============================================================================

describe('EntryService.update', () => {
  it('基本的なエントリ更新が成功する', async () => {
    const existing = createMockEntry({
      id: 'entry-1',
      title: 'Old',
      start_time: '2026-03-17T09:00:00Z',
      end_time: '2026-03-17T10:00:00Z',
    });
    const updated = { ...existing, title: 'Updated' };

    const { service, mockSupabase } = createService();

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      // 1回目: getExistingEntry
      if (callCount === 1) return createChainableMock(existing);
      // 2回目: update
      return createChainableMock(updated);
    });

    const result = await service.update({
      userId: USER_ID,
      entryId: 'entry-1',
      input: { title: 'Updated' },
    });

    expect(result.title).toBe('Updated');
  });

  it('DB exclusion constraint violation で TIME_OVERLAP を返す', async () => {
    const existing = createMockEntry({ id: 'entry-1' });
    const { service, mockSupabase } = createService();

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createChainableMock(existing);
      return createChainableMock(null, {
        message: 'conflicting key value violates exclusion constraint',
        code: '23P01',
      });
    });

    try {
      await service.update({
        userId: USER_ID,
        entryId: 'entry-1',
        input: {
          start_time: '2026-03-17T10:00:00Z',
          end_time: '2026-03-17T11:00:00Z',
        },
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EntryServiceError);
      expect((e as EntryServiceError).code).toBe('TIME_OVERLAP');
    }
  });

  it('fulfillment_score が正常に設定される', async () => {
    const existing = createMockEntry({
      id: 'entry-1',
      fulfillment_score: null,
    });
    const updated = {
      ...existing,
      fulfillment_score: 2,
    };

    const { service, mockSupabase } = createService();

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createChainableMock(existing);
      return createChainableMock(updated);
    });

    const result = await service.update({
      userId: USER_ID,
      entryId: 'entry-1',
      input: { fulfillment_score: 2 },
    });

    expect(result.fulfillment_score).toBe(2);
  });
});

// ============================================================================
// delete
// ============================================================================

describe('EntryService.delete', () => {
  it('エントリ削除が成功する', async () => {
    const { service, mockSupabase } = createService();

    // delete は rpc('soft_delete_entry') を使用する
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const result = await service.delete({
      userId: USER_ID,
      entryId: 'entry-1',
    });

    expect(result.success).toBe(true);
  });

  it('削除失敗時に DELETE_FAILED を返す', async () => {
    const { service, mockSupabase } = createService();

    // delete は rpc('soft_delete_entry') を使用する
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'delete failed', code: 'PGRST116' },
    });

    try {
      await service.delete({ userId: USER_ID, entryId: 'entry-1' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EntryServiceError);
      expect((e as EntryServiceError).code).toBe('DELETE_FAILED');
    }
  });
});

// ============================================================================
// restore (Undo 用)
// ============================================================================

describe('EntryService.restore', () => {
  it('restore_entry RPC を userId / entryId で呼び成功を返す', async () => {
    const { service, mockSupabase } = createService();

    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const result = await service.restore({ userId: USER_ID, entryId: 'entry-1' });

    expect(result.success).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('restore_entry', {
      p_entry_id: 'entry-1',
      p_user_id: USER_ID,
    });
  });

  it('restore 失敗時に RESTORE_FAILED を返す', async () => {
    const { service, mockSupabase } = createService();

    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'restore failed', code: 'PGRST301' },
    });

    try {
      await service.restore({ userId: USER_ID, entryId: 'entry-1' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EntryServiceError);
      expect((e as EntryServiceError).code).toBe('RESTORE_FAILED');
    }
  });
});

// ============================================================================
// list (検索サニタイズ)
// ============================================================================

describe('EntryService.list - search sanitization', () => {
  it('PostgREST 特殊文字がサニタイズされる', async () => {
    const { service, mockSupabase } = createService();
    const entriesMock = createChainableMock([]);
    const tagsMock = createChainableMock([]);

    // or() の呼び出しを追跡
    const orSpy = vi.fn().mockReturnValue(entriesMock);
    entriesMock.or = orSpy;

    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagsMock : entriesMock,
    );

    await service.list({ userId: USER_ID, search: 'test%drop*:injection' });

    // % * : が除去されている
    expect(orSpy).toHaveBeenCalledWith(
      'title.ilike.%testdropinjection%,description.ilike.%testdropinjection%',
    );
  });

  it('タグ名マッチ時は or() に tag_id.in を含める', async () => {
    const { service, mockSupabase } = createService();
    const entriesMock = createChainableMock([]);
    const tagsMock = createChainableMock([{ id: 'tag-1' }, { id: 'tag-2' }]);

    const orSpy = vi.fn().mockReturnValue(entriesMock);
    entriesMock.or = orSpy;

    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagsMock : entriesMock,
    );

    await service.list({ userId: USER_ID, search: 'work' });

    expect(orSpy).toHaveBeenCalledWith(
      'title.ilike.%work%,description.ilike.%work%,tag_id.in.(tag-1,tag-2)',
    );
  });

  it('サニタイズ後に空文字なら or() を呼ばない', async () => {
    const { service, mockSupabase } = createService();
    const entriesMock = createChainableMock([]);
    const orSpy = vi.fn().mockReturnValue(entriesMock);
    entriesMock.or = orSpy;

    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? createChainableMock([]) : entriesMock,
    );

    await service.list({ userId: USER_ID, search: '%*:.,()\\' });

    expect(orSpy).not.toHaveBeenCalled();
  });
});

// ============================================================================
// checkTimeOverlap
// ============================================================================

describe('EntryService.checkTimeOverlap', () => {
  it('重複なしで空配列を返す', async () => {
    const { service, mockSupabase } = createService();
    const mock = createChainableMock([]);
    mockSupabase.from.mockReturnValue(mock);

    const result = await service.checkTimeOverlap({
      userId: USER_ID,
      startTime: '2026-03-17T10:00:00Z',
      endTime: '2026-03-17T11:00:00Z',
    });

    expect(result).toEqual([]);
  });

  it('重複ありでIDリストを返す', async () => {
    const { service, mockSupabase } = createService();
    const mock = createChainableMock([
      {
        id: 'overlap-1',
        start_time: '2026-03-17T10:00:00Z',
        end_time: '2026-03-17T11:00:00Z',
        actual_start_time: null,
        actual_end_time: null,
      },
      {
        id: 'overlap-2',
        start_time: '2026-03-17T10:30:00Z',
        end_time: '2026-03-17T11:30:00Z',
        actual_start_time: null,
        actual_end_time: null,
      },
    ]);
    mockSupabase.from.mockReturnValue(mock);

    const result = await service.checkTimeOverlap({
      userId: USER_ID,
      startTime: '2026-03-17T10:00:00Z',
      endTime: '2026-03-17T11:00:00Z',
    });

    expect(result).toEqual(['overlap-1', 'overlap-2']);
  });

  it('excludeEntryId で自身を除外する', async () => {
    const { service, mockSupabase } = createService();
    const mock = createChainableMock([]);
    const neqSpy = vi.fn().mockReturnValue(mock);
    mock.neq = neqSpy;
    mockSupabase.from.mockReturnValue(mock);

    await service.checkTimeOverlap({
      userId: USER_ID,
      startTime: '2026-03-17T10:00:00Z',
      endTime: '2026-03-17T11:00:00Z',
      excludeEntryId: 'self-id',
    });

    expect(neqSpy).toHaveBeenCalledWith('id', 'self-id');
  });
});
