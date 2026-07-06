import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';

import { MobileTouchHint } from './MobileTouchHint';

/**
 * MobileTouchHint — モバイルタッチ操作のヒント表示
 *
 * 初回モバイルアクセス時にロングプレス操作のヒントをトースト風に表示する。
 *
 * ## 動作仕様
 * - `useMediaQuery(MEDIA_QUERIES.mobile)` が `true` のときのみ表示される
 * - localStorage に `calendar-mobile-hint-dismissed` が未設定の場合、1秒後に表示
 * - 15秒後に自動非表示（localStorage には保存しない → 次回も再表示）
 * - Xボタンで永続非表示（localStorage にフラグを保存）
 *
 * ## Storybook での制約
 * `useMediaQuery` は `window.matchMedia` に依存するため、ビューポートアドオンの
 * 幅変更だけでは `isMobile` が `true` にならない。
 * 各ストーリーのデコレーターで `window.matchMedia` をモックし、モバイル判定を強制する。
 */
const meta = {
  title: 'Product/Features/Calendar/Interaction/MobileTouchHint',
  component: MobileTouchHint,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MobileTouchHint>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────────────────────────
// ユーティリティ: window.matchMedia をモックしてモバイル判定を強制する
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `window.matchMedia` を差し替えて `(max-width: 767px)` を true として返す。
 * @returns 元の matchMedia を復元するクリーンアップ関数
 */
function stubMatchMediaAsMobile(): () => void {
  const original = window.matchMedia.bind(window);

  const stub = (query: string): MediaQueryList => {
    const mql = original(query);
    // モバイルクエリのみ matches を true に差し替える
    if (query === '(max-width: 767px)') {
      return {
        ...mql,
        matches: true,
        addEventListener: mql.addEventListener.bind(mql),
        removeEventListener: mql.removeEventListener.bind(mql),
        dispatchEvent: mql.dispatchEvent.bind(mql),
        onchange: mql.onchange,
        media: mql.media,
        addListener: mql.addListener?.bind(mql),
        removeListener: mql.removeListener?.bind(mql),
      } as MediaQueryList;
    }
    return original(query);
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: stub,
  });

  return () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: original,
    });
  };
}

const STORAGE_KEY = 'calendar-mobile-hint-dismissed';

// ─────────────────────────────────────────────────────────────────────────────
// ストーリー
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 初回表示状態。
 *
 * localStorage に dismissal フラグがない状態で起動し、
 * 1秒後にヒントがスライドインして表示される。
 */
export const Default: Story = {
  decorators: [
    (Story) => {
      // localStorage をクリアしてから matchMedia をモック
      localStorage.removeItem(STORAGE_KEY);
      const restore = stubMatchMediaAsMobile();

      // Story アンマウント後に matchMedia を復元
      // Storybook はデコレーターのクリーンアップを提供しないため、
      // 次の Story 選択時に自然にリセットされる
      void restore; // restore は次ストーリー遷移時または手動で呼ぶ想定

      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    // コンポーネント内の 1000ms delay を待機
    await waitFor(
      () => {
        const alert = within(canvasElement).queryByRole('alert');
        if (!alert) {
          // fixed 配置のため document.body も検索
          const bodyAlert = document.body.querySelector('[role="alert"]');
          if (!bodyAlert) throw new Error('ヒントがまだ表示されていません');
        }
      },
      { timeout: 3000, interval: 100 },
    );

    // ヒントが表示されていることを確認
    const alert =
      within(canvasElement).queryByRole('alert') ?? document.body.querySelector('[role="alert"]');

    expect(alert).toBeTruthy();
  },
};

/**
 * 永続非表示状態。
 *
 * localStorage に dismissal フラグが設定済みの場合、
 * コンポーネントは何も表示しない。
 */
export const AlreadyDismissed: Story = {
  decorators: [
    (Story) => {
      // dismissal フラグを設定してからレンダリング
      localStorage.setItem(STORAGE_KEY, 'true');
      stubMatchMediaAsMobile();
      return <Story />;
    },
  ],
  render: () => (
    <div className="bg-background relative h-screen w-full">
      <div className="p-6">
        <p className="text-muted-foreground text-sm">
          localStorage に dismissal フラグが設定済みのため、 MobileTouchHint
          は何も表示しません（null を返す）。
        </p>
      </div>
      {/* 実コンポーネント — dismissal 済みのため null になる */}
      <MobileTouchHint />
    </div>
  ),
};

/**
 * Xボタンで閉じるインタラクション。
 *
 * ヒントが表示された後に閉じるボタンをクリックすると
 * ヒントが非表示になり、localStorage にフラグが保存される。
 */
export const DismissInteraction: Story = {
  decorators: [
    (Story) => {
      localStorage.removeItem(STORAGE_KEY);
      stubMatchMediaAsMobile();
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    // 1秒 delay を待機してヒントが表示されるまで確認
    await waitFor(
      () => {
        const alert =
          within(canvasElement).queryByRole('alert') ??
          document.body.querySelector('[role="alert"]');
        if (!alert) throw new Error('ヒントがまだ表示されていません');
      },
      { timeout: 3000, interval: 100 },
    );

    // 閉じるボタンをクリック
    const closeButton =
      within(canvasElement).queryByRole('button') ??
      document.body.querySelector('[role="alert"] button');

    expect(closeButton).toBeTruthy();
    (closeButton as HTMLButtonElement).click();

    // ヒントが非表示になったことを確認
    await waitFor(
      () => {
        const alert =
          within(canvasElement).queryByRole('alert') ??
          document.body.querySelector('[role="alert"]');
        if (alert) throw new Error('ヒントがまだ表示されています');
      },
      { timeout: 1000, interval: 50 },
    );

    // localStorage に dismissal フラグが保存されていることを確認
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  },
};
