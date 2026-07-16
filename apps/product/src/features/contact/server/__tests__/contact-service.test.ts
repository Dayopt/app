/**
 * Contact Service Unit Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// fetch モック
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockLoggerError = vi.fn();
vi.mock('@/lib/logger', () => ({
  logger: {
    log: vi.fn(),
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockCaptureUnexpectedError = vi.fn();
vi.mock('@/lib/sentry', () => ({
  captureUnexpectedError: (...args: unknown[]) => mockCaptureUnexpectedError(...args),
}));

async function importService(envOverrides?: Record<string, string>) {
  vi.resetModules();

  vi.stubEnv('GITHUB_TOKEN', envOverrides?.GITHUB_TOKEN ?? 'ghp_test_token');
  vi.stubEnv('GITHUB_CONTACT_REPO', envOverrides?.GITHUB_CONTACT_REPO ?? 'test-owner/test-repo');

  return import('../contact-service');
}

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

describe('createGitHubIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常系: GitHub Issue を作成する', async () => {
    const { createGitHubIssue } = await importService();

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
    const { createGitHubIssue } = await importService();

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
    expect(body.labels).toEqual(['contact', 'feedback', 'app', 'bug']);
  });

  it('正常系: カテゴリごとのラベルが正しい', async () => {
    const { createGitHubIssue } = await importService();

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
    const { createGitHubIssue } = await importService();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Validation Failed'),
    });

    await expect(createGitHubIssue(defaultParams)).rejects.toThrow('GitHub API error (422)');
  });

  it('エラー系: 環境変数が未設定', async () => {
    const { createGitHubIssue } = await importService({
      GITHUB_TOKEN: '',
      GITHUB_CONTACT_REPO: '',
    });

    await expect(createGitHubIssue(defaultParams)).rejects.toThrow(
      'GitHub API configuration is missing',
    );
  });

  it('GitHub API向けの必須headerとlabelsとtimeout signalを送る', async () => {
    const { createGitHubIssue } = await importService();
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
      labels: ['contact', 'feedback', 'app', 'bug'],
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('複数行とUnicodeを含むmessageをそのまま保持する', async () => {
    const { createGitHubIssue } = await importService();
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
    const { createGitHubIssue } = await importService({
      GITHUB_TOKEN: '',
      GITHUB_CONTACT_REPO: 'test-owner/test-repo',
    });

    await expect(createGitHubIssue(defaultParams)).rejects.toMatchObject({
      code: 'GITHUB_API_FAILED',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('GITHUB_CONTACT_REPOだけ未設定でもAPIを呼ばない', async () => {
    const { createGitHubIssue } = await importService({
      GITHUB_TOKEN: 'ghp_test_token',
      GITHUB_CONTACT_REPO: '',
    });

    await expect(createGitHubIssue(defaultParams)).rejects.toMatchObject({
      code: 'GITHUB_API_FAILED',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('network errorを呼び出し元へ伝播する', async () => {
    const { createGitHubIssue } = await importService();
    const networkError = new TypeError('fetch failed');
    mockFetch.mockRejectedValueOnce(networkError);

    await expect(createGitHubIssue(defaultParams)).rejects.toBe(networkError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('2xxでもGitHub response schemaが不正なら失敗する', async () => {
    const { createGitHubIssue } = await importService();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ html_url: 'not-a-url', number: '1' }),
    });

    await expect(createGitHubIssue(defaultParams)).rejects.toMatchObject({
      code: 'GITHUB_API_FAILED',
      message: 'GitHub API returned an invalid response',
    });
  });
});

describe('deliverContactFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常系: 起票成功時は delivered: true と issue 情報を返す', async () => {
    const { deliverContactFeedback } = await importService();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ html_url: 'https://github.com/issues/5', number: 5 }),
    });

    const result = await deliverContactFeedback(defaultParams);

    expect(result).toEqual({
      delivered: true,
      issueUrl: 'https://github.com/issues/5',
      issueNumber: 5,
    });
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockCaptureUnexpectedError).not.toHaveBeenCalled();
  });

  it('GitHub API 失敗時は成功を偽装せず再送可能な例外を返す', async () => {
    const { deliverContactFeedback } = await importService();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    await expect(deliverContactFeedback(defaultParams)).rejects.toMatchObject({
      code: 'GITHUB_API_FAILED',
    });
  });

  it('失敗時のログにフィードバック本文やemailを含めない', async () => {
    const { deliverContactFeedback } = await importService();

    const networkError = new TypeError('fetch failed');
    mockFetch.mockRejectedValueOnce(networkError);

    await expect(deliverContactFeedback(defaultParams)).rejects.toBe(networkError);

    expect(mockLoggerError).toHaveBeenCalledWith('Contact feedback delivery to GitHub failed', {
      userId: 'user-123',
      category: 'bug',
      errorType: 'TypeError',
    });
    expect(JSON.stringify(mockLoggerError.mock.calls)).not.toContain('test@example.com');
    expect(JSON.stringify(mockLoggerError.mock.calls)).not.toContain('Something is broken');
  });

  it('Sentryには元のErrorと技術コンテキストだけを渡す', async () => {
    const { deliverContactFeedback } = await importService();

    const networkError = new TypeError('fetch failed');
    mockFetch.mockRejectedValueOnce(networkError);

    await expect(deliverContactFeedback(defaultParams)).rejects.toBe(networkError);

    expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(networkError, {
      feature: 'contact',
      source: 'contact',
      operation: 'github_issue_create',
      userId: 'user-123',
    });
    expect(JSON.stringify(mockCaptureUnexpectedError.mock.calls)).not.toContain('test@example.com');
    expect(JSON.stringify(mockCaptureUnexpectedError.mock.calls)).not.toContain(
      'Something is broken',
    );
  });

  it('環境変数未設定時も成功扱いにせず本文をログへ退避しない', async () => {
    const { deliverContactFeedback } = await importService({
      GITHUB_TOKEN: '',
      GITHUB_CONTACT_REPO: '',
    });

    await expect(deliverContactFeedback(defaultParams)).rejects.toMatchObject({
      code: 'GITHUB_API_FAILED',
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockCaptureUnexpectedError).toHaveBeenCalled();
    expect(JSON.stringify(mockLoggerError.mock.calls)).not.toContain('test@example.com');
    expect(JSON.stringify(mockLoggerError.mock.calls)).not.toContain('Something is broken');
  });
});
