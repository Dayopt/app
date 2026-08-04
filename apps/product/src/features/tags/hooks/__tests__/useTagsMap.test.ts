/**
 * useTagsMap Unit Tests
 *
 * 表示専用の全タグ lookup が、アクティブ + アーカイブ済みを正しくマージすることを固定する。
 * アーカイブ済みタグを持つ過去の Plan / Record が「タグなし」表示に落ちる回帰（#1576）の防止。
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Tag } from '../../types';
import { useTagsMap } from '../useTagsMap';

const mockUseTags = vi.fn();
const mockUseArchivedTags = vi.fn();

vi.mock('../useTagsQuery', () => ({
  useTags: () => mockUseTags(),
}));

vi.mock('../useTagArchiveMutations', () => ({
  useArchivedTags: () => mockUseArchivedTags(),
}));

function makeTag(overrides: Partial<Tag>): Tag {
  return {
    id: 'tag-1',
    name: 'Tag',
    user_id: 'user-1',
    color: 'blue',
    icon: null,
    is_active: true,
    archived_at: null,
    parent_id: null,
    sort_order: 0,
    created_at: '2026-06-09T00:00:00.000Z',
    updated_at: '2026-06-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('useTagsMap', () => {
  it('アーカイブ済みタグも含めてIDから解決できる（過去ブロックの名前・色が保持される）', () => {
    const activeTag = makeTag({ id: 'active-1', name: 'Active', color: 'blue' });
    const archivedTag = makeTag({
      id: 'archived-1',
      name: 'Archived Tag',
      color: 'rose',
      archived_at: '2026-08-01T00:00:00.000Z',
    });

    mockUseTags.mockReturnValue({ data: [activeTag] });
    mockUseArchivedTags.mockReturnValue({ data: [archivedTag] });

    const { result } = renderHook(() => useTagsMap());

    expect(result.current.getTagById('archived-1')).toEqual({
      id: 'archived-1',
      name: 'Archived Tag',
      color: 'rose',
      icon: null,
    });
    expect(result.current.getTagById('active-1')).toBeDefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('getTagsByIds でもアーカイブ済みIDを解決できる', () => {
    const archivedTag = makeTag({
      id: 'archived-1',
      name: 'Archived Tag',
      archived_at: '2026-08-01T00:00:00.000Z',
    });
    mockUseTags.mockReturnValue({ data: [] });
    mockUseArchivedTags.mockReturnValue({ data: [archivedTag] });

    const { result } = renderHook(() => useTagsMap());

    const resolved = result.current.getTagsByIds(['archived-1', 'missing-id']);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.name).toBe('Archived Tag');
  });

  it('アーカイブ済み側が未取得の間は isLoading を true にする（誤フォールバック防止）', () => {
    mockUseTags.mockReturnValue({ data: [makeTag({ id: 'active-1' })] });
    mockUseArchivedTags.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useTagsMap());

    expect(result.current.isLoading).toBe(true);
  });

  it('アクティブ側が未取得の間も isLoading を true にする', () => {
    mockUseTags.mockReturnValue({ data: undefined });
    mockUseArchivedTags.mockReturnValue({ data: [] });

    const { result } = renderHook(() => useTagsMap());

    expect(result.current.isLoading).toBe(true);
  });

  it('両方取得済みなら isLoading は false（アーカイブ済みが0件でも）', () => {
    mockUseTags.mockReturnValue({ data: [makeTag({ id: 'active-1' })] });
    mockUseArchivedTags.mockReturnValue({ data: [] });

    const { result } = renderHook(() => useTagsMap());

    expect(result.current.isLoading).toBe(false);
  });

  it('color が null のタグは gray にフォールバックする（アーカイブ済みでも同様）', () => {
    mockUseTags.mockReturnValue({ data: [] });
    mockUseArchivedTags.mockReturnValue({
      data: [makeTag({ id: 'archived-2', color: null, archived_at: '2026-08-01T00:00:00.000Z' })],
    });

    const { result } = renderHook(() => useTagsMap());

    expect(result.current.getTagById('archived-2')?.color).toBe('gray');
  });
});
