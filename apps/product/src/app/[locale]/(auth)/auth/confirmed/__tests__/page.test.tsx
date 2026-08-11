import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  // key をそのまま返す。ここで確かめたいのは status → 文言キーの対応であって翻訳内容ではない。
  getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock('@dayopt/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ children, href }: { children: React.ReactNode; href: string }) =>
      React.createElement('a', { href }, children),
  };
});

import EmailConfirmedPage from '../page';

async function renderPage(status?: string | string[]) {
  const ui = await EmailConfirmedPage({ searchParams: Promise.resolve({ status }) });
  return render(ui);
}

describe('auth confirmed page', () => {
  // #1956: 片側だけ確認した状態で「もう一方も確認する」ことが伝わる必要がある。
  it('email_change の片側確認では、もう一方の確認が要ることを伝える', async () => {
    await renderPage('email_change_confirmed');

    expect(screen.getByRole('status')).toHaveTextContent(
      'auth.confirmed.email_change_confirmed.title',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'auth.confirmed.email_change_confirmed.body',
    );
  });

  it('その他の確認では確認済みであることを伝える', async () => {
    await renderPage('email_confirmed');

    expect(screen.getByRole('status')).toHaveTextContent('auth.confirmed.email_confirmed.title');
  });

  it('失敗はリンクの問題だと分かる文言を出す', async () => {
    await renderPage('failed');

    expect(screen.getByRole('status')).toHaveTextContent('auth.confirmed.failed.title');
  });

  // 未知・欠落・重複指定の status は failed に倒す（fail closed）。翻訳キーの穴を突いて
  // 生の key や空表示になるのを防ぐ。配列ケースは**先頭を未知値**にする — 先頭が既知値だと
  // 通常の成功表示になるだけで、fail closed の経路を一度も通らない。
  it.each([
    ['未知の値', 'made_up_value'],
    ['欠落', undefined],
    ['空文字', ''],
    ['先頭が未知値の配列', ['made_up_value', 'email_confirmed'] as string[]],
    ['prototype 汚染を狙う値', '__proto__'],
  ])('%s の status では failed の文言を出す', async (_label, status) => {
    await renderPage(status);

    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain('auth.confirmed.failed.title');
    expect(text).not.toContain('made_up_value');
    expect(text).not.toContain('__proto__');
  });

  // 配列の先頭が既知値なら、その値として扱う（上のケースと対にして挙動を固定する）。
  it('先頭が既知値の配列はその status として扱う', async () => {
    await renderPage(['email_confirmed', 'failed'] as string[]);

    expect(screen.getByRole('status')).toHaveTextContent('auth.confirmed.email_confirmed.title');
  });

  it('ログイン画面への導線を出す', async () => {
    await renderPage('email_change_confirmed');

    expect(screen.getByRole('link', { name: 'auth.confirmed.goToLogin' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
  });
});
