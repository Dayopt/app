import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

const mockUpload = vi.fn();
const mockRemove = vi.fn();
const mockList = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        remove: mockRemove,
        list: mockList,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { uploadAvatar } from '../storage';

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
    // 既に消えていた。新しい実装は upload 成功を確認するまで remove を呼ばない。
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('upload に成功した場合のみ、同ユーザーフォルダの他拡張子ファイルを回収する', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockList.mockResolvedValue({
      data: [{ name: 'avatar.png' }, { name: 'avatar.webp' }],
      error: null,
    });

    // png → webp への切り替え。新しい key は user-1/avatar.webp。
    const file = makeImageFile('photo.webp', 'image/webp');

    const url = await uploadAvatar(file, 'user-1');

    expect(mockUpload).toHaveBeenCalledWith(
      'user-1/avatar.webp',
      file,
      expect.objectContaining({ upsert: true }),
    );
    // 新しい key（avatar.webp）自身は回収対象から除外し、旧 key（avatar.png）だけ削除する。
    expect(mockRemove).toHaveBeenCalledWith(['user-1/avatar.png']);
    expect(url).toContain('avatar.png'); // getPublicUrl のモック値をそのまま使っている
  });

  it('回収（list/remove）が失敗しても、アップロード自体は成功として扱う（ベストエフォート）', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockList.mockResolvedValue({ data: null, error: { message: 'list failed' } });

    const file = makeImageFile('avatar.png', 'image/png');

    await expect(uploadAvatar(file, 'user-1')).resolves.toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('同一拡張子の再アップロードでは回収対象が無い（remove を呼ばない）', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockList.mockResolvedValue({ data: [{ name: 'avatar.png' }], error: null });

    const file = makeImageFile('avatar.png', 'image/png');

    await uploadAvatar(file, 'user-1');

    expect(mockRemove).not.toHaveBeenCalled();
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
});
