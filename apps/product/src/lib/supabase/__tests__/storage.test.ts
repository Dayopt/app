import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

const mockUpload = vi.fn();
const mockRemove = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        remove: mockRemove,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE, uploadAvatar } from '../storage';

function makeImageFile(name: string, type: string, sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe('uploadAvatar（#2449: 非原子的な置換の回帰防止）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublicUrl.mockReturnValue({
      data: {
        publicUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/user-1/avatar.png',
      },
    });
  });

  it('upload に失敗した場合、旧アバターを削除しない（remove を一度も呼ばない）', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'bucket rejected the file' } });

    const file = makeImageFile('avatar.png', 'image/png');

    await expect(uploadAvatar(file, 'user-1')).rejects.toThrow('アップロードに失敗しました');

    // 修正前は upload の前に remove() を呼んでいたため、upload 失敗時にも旧ファイルが
    // 既に消えていた。新しい実装は remove() を一切呼ばない（upsert: true が同一 key への
    // 上書きを担うため）。
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('upload に成功した場合、remove を呼ばずに公開 URL を返す', async () => {
    mockUpload.mockResolvedValue({ error: null });

    const file = makeImageFile('avatar.png', 'image/png');

    const url = await uploadAvatar(file, 'user-1');

    expect(mockUpload).toHaveBeenCalledWith(
      'user-1/avatar.png',
      file,
      expect.objectContaining({ upsert: true }),
    );
    // 拡張子が変わっても（png → webp 等）孤児ファイルの回収はしない（#2464 cross-review
    // 指摘: 回収を upload 直後に行うと、呼び出し元の永続化が失敗した時に旧ファイルが
    // 既に消えている 404 の窓ができてしまう。孤児の扱いは #2460 の scope）。
    expect(mockRemove).not.toHaveBeenCalled();
    expect(url).toContain('avatar.png');
  });

  it('許可されていない MIME type は upload を試みずに拒否する', async () => {
    const file = makeImageFile('malicious.exe', 'application/x-msdownload');

    await expect(uploadAvatar(file, 'user-1')).rejects.toThrow('画像ファイルのみアップロード可能');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('5MB を超えるファイルは upload を試みずに拒否する', async () => {
    const file = makeImageFile('big.png', 'image/png', 6 * 1024 * 1024);

    await expect(uploadAvatar(file, 'user-1')).rejects.toThrow('ファイルサイズは5MB以下');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  // client 側の早期 validation 値は bucket 側の実際の制約
  // （supabase/config.toml の [storage.buckets.avatars]、
  // scripts/ci/production-storage-rls-audit.mjs の EXPECTED_AVATARS_BUCKET が正本）の
  // 3 箇所目の写経になっている（#2464 cross-review 指摘）。この test はその 3 値が
  // 一致していることをリテラルで固定する。いずれかを変える PR はこの test の diff を
  // 伴わない限り気づかれない（STORAGE_OBJECTS_APP_POLICY_NAMES と同型の二重管理対策）。
  it('client 側の validation 値は bucket の実際の制約（config.toml / EXPECTED_AVATARS_BUCKET）とリテラルで一致する（#2464）', () => {
    expect(MAX_FILE_SIZE).toBe(5242880); // 5MiB
    expect([...ALLOWED_IMAGE_TYPES].sort()).toEqual(
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].sort(),
    );
  });
});
