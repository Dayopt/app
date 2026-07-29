/**
 * メンテナンスページ（Route Handler）
 *
 * システムメンテナンス中に表示されるページ
 * locale プレフィックスなしでアクセス可能（/maintenance）
 *
 * Route Handlerとして実装することで、ルートレイアウトの
 * Providersをバイパスし、
 * CSP違反を防止する
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Under Maintenance | Dayopt</title>
  <meta name="description" content="System is currently under maintenance">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500&display=swap');

    :root {
      --background: oklch(1 0 0);
      --foreground: oklch(0.3211 0 0);
      --card: oklch(1 0 0);
      --card-foreground: oklch(0.3211 0 0);
      --muted: oklch(0.97 0.002 264.54);
      --muted-foreground: oklch(0.45 0.02 264.54);
      --border: oklch(0.9 0.006 264.54);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --background: oklch(0.2046 0 0);
        --foreground: oklch(0.9219 0 0);
        --card: oklch(0.2046 0 0);
        --card-foreground: oklch(0.9219 0 0);
        --muted: oklch(0.25 0 0);
        --muted-foreground: oklch(0.78 0 0);
        --border: oklch(0.3715 0 0);
      }
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      background-color: var(--background);
      color: var(--foreground);
    }

    .container {
      display: flex;
      min-height: 100vh;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .card {
      background-color: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 2rem;
      width: 100%;
      max-width: 28rem;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    }

    .icon-container {
      display: flex;
      justify-content: center;
      margin-bottom: 1.5rem;
    }

    .icon-bg {
      background-color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: center;
      height: 4rem;
      width: 4rem;
      border-radius: 9999px;
    }

    .icon {
      color: var(--muted-foreground);
      height: 2rem;
      width: 2rem;
    }

    .title-section {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .title {
      color: var(--foreground);
      font-size: 1.5rem;
      /* デザインシステムのウェイトは 400 / 500 のみ（ページタイトル = text-2xl font-medium 相当）。
         700 を残すと CDN で取得しないウェイトになり、ブラウザの擬似ボールドになる。 */
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      color: var(--muted-foreground);
      font-size: 0.875rem;
    }

    .description {
      background-color: var(--muted);
      border-radius: 0.25rem;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }

    .description-text {
      color: var(--foreground);
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .description-sub {
      color: var(--muted-foreground);
      font-size: 0.75rem;
    }

    .footer {
      color: var(--muted-foreground);
      text-align: center;
      font-size: 0.75rem;
    }

    .footer-light {
      color: oklch(from var(--muted-foreground) l c h / 0.7);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <!-- アイコン -->
      <div class="icon-container">
        <div class="icon-bg">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"></path>
          </svg>
        </div>
      </div>

      <!-- タイトル -->
      <div class="title-section">
        <h1 class="title">Under Maintenance</h1>
      </div>

      <!-- 説明 -->
      <div class="description">
        <p class="description-text">We're currently performing system maintenance.</p>
        <p class="description-sub">Please check back shortly.</p>
      </div>

      <!-- お詫びメッセージ -->
      <p class="footer">
        We apologize for the inconvenience.
      </p>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, must-revalidate',
      'Retry-After': '3600',
    },
  });
}
