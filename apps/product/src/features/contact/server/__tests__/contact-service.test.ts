/**
 * Contact Service Unit Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// fetch モック
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

async function importService(envOverrides?: Record<string, string>) {
  vi.resetModules();

  vi.stubEnv('GITHUB_TOKEN', envOverrides?.GITHUB_TOKEN ?? 'ghp_test_token');
  vi.stubEnv('GITHUB_CONTACT_REPO', envOverrides?.GITHUB_CONTACT_REPO ?? 'test-owner/test-repo');

  const mod = await import('../contact-service');
  return mod.createGitHubIssue;
}

describe('createGitHubIssue', () => {
  const defaultParams = {
    userId: 'user-123',
    userEmail: 'test@example.com',
    userName: 'Test User',
    input: {
      category: 'bug' as const,
      message: 'Something is broken',
      environment: {
        appVersion: '0.19.0',
        os: 'macOS 15.0',
        browser: 'Chrome 120.0',
        timezone: 'Asia/Tokyo',
        language: 'ja',
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常系: GitHub Issue を作成する', async () => {
    const createGitHubIssue = await importService();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ html_url: 'https://github.com/issues/1', number: 1 }),
    });

    const result = await createGitHubIssue(defaultParams);

    expect(result).toEqual({
      issueUrl: 'https://github.com/issues/1',
      issueNumber: 1,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-owner/test-repo/issues',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'token ghp_test_token',
        }),
      }),
    );
  });

  it('正常系: Issue 本文にユーザー情報とメッセージが含まれる', async () => {
    const createGitHubIssue = await importService();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ html_url: 'https://github.com/issues/2', number: 2 }),
    });

    await createGitHubIssue(defaultParams);

    const fetchCall = mockFetch.mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as {
      title: string;
      body: string;
      labels: string[];
    };

    expect(body.title).toBe('[App] [Bug] Test User');
    expect(body.body).toContain('via **Dayopt App**');
    expect(body.body).toContain('**From:** Test User (test@example.com)');
    expect(body.body).toContain('`user-123`');
    expect(body.body).toContain('Something is broken');
    expect(body.body).toContain('**Environment:**');
    expect(body.body).toContain('App Version: 0.19.0');
    expect(body.body).toContain('OS: macOS 15.0');
    expect(body.body).toContain('Browser: Chrome 120.0');
    expect(body.body).toContain('Timezone: Asia/Tokyo');
    expect(body.body).toContain('Language: ja');
    expect(body.labels).toEqual(['contact', 'app', 'bug']);
  });

  it('正常系: カテゴリごとのラベルが正しい', async () => {
    const createGitHubIssue = await importService();

    const categories = [
      { input: 'bug' as const, label: 'Bug' },
      { input: 'feature' as const, label: 'Feature' },
      { input: 'question' as const, label: 'Question' },
      { input: 'other' as const, label: 'Other' },
    ];

    for (const { input, label } of categories) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ html_url: 'https://github.com/issues/1', number: 1 }),
      });

      await createGitHubIssue({
        ...defaultParams,
        input: {
          category: input,
          message: 'Test message for category',
          environment: defaultParams.input.environment,
        },
      });

      const fetchCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as {
        title: string;
        labels: string[];
      };

      expect(body.title).toBe(`[App] [${label}] Test User`);
      expect(body.labels).toContain(input);
      expect(body.labels).toContain('app');
    }
  });

  it('エラー系: GitHub API がエラーを返す', async () => {
    const createGitHubIssue = await importService();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Validation Failed'),
    });

    await expect(createGitHubIssue(defaultParams)).rejects.toThrow(
      'GitHub API error (422): Validation Failed',
    );
  });

  it('エラー系: 環境変数が未設定', async () => {
    const createGitHubIssue = await importService({ GITHUB_TOKEN: '', GITHUB_CONTACT_REPO: '' });

    await expect(createGitHubIssue(defaultParams)).rejects.toThrow(
      'GitHub API configuration is missing',
    );
  });

  it('GitHub API向けの必須headerとlabelsを送る', async () => {
    const createGitHubIssue = await importService();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ html_url: 'https://github.com/issues/3', number: 3 }),
    });

    await createGitHubIssue(defaultParams);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-owner/test-repo/issues',
      expect.objectContaining({
        headers: {
          Authorization: 'token ghp_test_token',
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: expect.any(String),
      }),
    );
    const request = mockFetch.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      labels: ['contact', 'app', 'bug'],
    });
  });

  it('複数行とUnicodeを含むmessageをそのまま保持する', async () => {
    const createGitHubIssue = await importService();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ html_url: 'https://github.com/issues/4', number: 4 }),
    });
    const message = '一行目\n\nSecond line: <script>alert(1)</script>';

    await createGitHubIssue({
      ...defaultParams,
      input: { ...defaultParams.input, message },
    });

    const request = mockFetch.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(request.body as string) as { body: string };
    expect(body.body).toContain(message);
  });

  it('GITHUB_TOKENだけ未設定でもAPIを呼ばない', async () => {
    const createGitHubIssue = await importService({
      GITHUB_TOKEN: '',
      GITHUB_CONTACT_REPO: 'test-owner/test-repo',
    });

    await expect(createGitHubIssue(defaultParams)).rejects.toMatchObject({
      code: 'GITHUB_API_FAILED',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('GITHUB_CONTACT_REPOだけ未設定でもAPIを呼ばない', async () => {
    const createGitHubIssue = await importService({
      GITHUB_TOKEN: 'ghp_test_token',
      GITHUB_CONTACT_REPO: '',
    });

    await expect(createGitHubIssue(defaultParams)).rejects.toMatchObject({
      code: 'GITHUB_API_FAILED',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('network errorを呼び出し元へ伝播する', async () => {
    const createGitHubIssue = await importService();
    const networkError = new TypeError('fetch failed');
    mockFetch.mockRejectedValueOnce(networkError);

    await expect(createGitHubIssue(defaultParams)).rejects.toBe(networkError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
