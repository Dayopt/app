import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CheckCircle, XCircle } from 'lucide-react';

const meta = {
  title: 'Shared/Foundations/Responsive',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Breakpoints: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">ブレークポイント</h1>
      <p className="text-muted-foreground mb-8">Material Design 3 Window Size Classes に基づく</p>

      <div className="grid max-w-5xl gap-8">
        {/* ブレークポイント一覧 */}
        <section>
          <h2 className="mb-4 text-lg font-medium">Tailwind v4 デフォルト</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="px-4 py-2 text-left">Prefix</th>
                  <th className="px-4 py-2 text-left">Min Width</th>
                  <th className="px-4 py-2 text-left">M3対応</th>
                  <th className="px-4 py-2 text-left">用途</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">sm:</code>
                  </td>
                  <td className="px-4 py-2">640px</td>
                  <td className="px-4 py-2">Compact/Medium境界</td>
                  <td className="text-muted-foreground px-4 py-2">タブレット縦</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">md:</code>
                  </td>
                  <td className="px-4 py-2">768px</td>
                  <td className="px-4 py-2">Medium</td>
                  <td className="text-muted-foreground px-4 py-2">タブレット縦</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">lg:</code>
                  </td>
                  <td className="px-4 py-2">1024px</td>
                  <td className="px-4 py-2">Expanded</td>
                  <td className="text-muted-foreground px-4 py-2">デスクトップ</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">xl:</code>
                  </td>
                  <td className="px-4 py-2">1280px</td>
                  <td className="px-4 py-2">Large</td>
                  <td className="text-muted-foreground px-4 py-2">ワイドスクリーン</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">2xl:</code>
                  </td>
                  <td className="px-4 py-2">1536px</td>
                  <td className="px-4 py-2">Extra-large</td>
                  <td className="text-muted-foreground px-4 py-2">超ワイド</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* MEDIA_QUERIES */}
        <section>
          <h2 className="mb-4 text-lg font-medium">useMediaQuery用クエリ</h2>
          <p className="text-muted-foreground mb-4 text-sm">src/lib/breakpoints.ts で定義</p>
          <div className="bg-container space-y-2 rounded-lg p-4 font-mono text-sm">
            <div>
              <span className="text-muted-foreground">MEDIA_QUERIES.mobile:</span> &apos;(max-width:
              767px)&apos;
            </div>
            <div>
              <span className="text-muted-foreground">MEDIA_QUERIES.tablet:</span> &apos;(min-width:
              768px) and (max-width: 1023px)&apos;
            </div>
            <div>
              <span className="text-muted-foreground">MEDIA_QUERIES.desktop:</span>{' '}
              &apos;(min-width: 1024px)&apos;
            </div>
            <div>
              <span className="text-muted-foreground">MEDIA_QUERIES.touch:</span> &apos;(hover:
              none) and (pointer: coarse)&apos;
            </div>
          </div>
        </section>

        {/* 使用例 */}
        <section>
          <h2 className="mb-4 text-lg font-medium">モバイルファースト</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-sm">
            {`// ✅ モバイルファースト（推奨）
<div className="p-4 md:p-6 lg:p-8">
  <h1 className="text-2xl md:text-3xl lg:text-4xl">タイトル</h1>
</div>

// ❌ デスクトップファースト（非推奨）
<div className="lg:p-8 md:p-6 p-4">
`}
          </pre>
        </section>
      </div>
    </div>
  ),
};

export const LayoutArchitecture: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">レイアウト切替アーキテクチャ</h1>
      <p className="text-muted-foreground mb-8">MEDIA_QUERIES.mobile（max-width: 767px）で二分岐</p>

      <div className="grid max-w-5xl gap-8">
        {/* レイアウト構造図 */}
        <section>
          <h2 className="mb-4 text-lg font-medium">レイアウト構造</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* MobileLayout */}
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm">MobileLayout（&lt; 768px）</h3>
              <div className="border-border overflow-hidden rounded-lg border">
                <LayoutSection label="AppHeader + account" bg="bg-container" height="h-8" />
                <LayoutSection label="MainContent" bg="bg-background" height="h-24" />
                <LayoutSection label="Tag footer h-14" bg="bg-container" height="h-8" />
              </div>
            </div>
            {/* DesktopLayout */}
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm">DesktopLayout（≥ 768px）</h3>
              <div className="border-border flex overflow-hidden rounded-lg border">
                <div className="border-border w-16 border-r">
                  <LayoutSection label="Sidebar w-64" bg="bg-container" height="h-full" />
                </div>
                <div className="flex-1">
                  <LayoutSection label="AppHeader" bg="bg-container" height="h-8" />
                  <LayoutSection label="MainContent" bg="bg-background" height="h-24" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 判定フック */}
        <section>
          <h2 className="mb-4 text-lg font-medium">判定フック</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="px-4 py-2 text-left">フック</th>
                  <th className="px-4 py-2 text-left">判定基準</th>
                  <th className="px-4 py-2 text-left">用途</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">useMediaQuery</code>
                  </td>
                  <td className="px-4 py-2">MEDIA_QUERIES.mobile (max-width: 767px)</td>
                  <td className="text-muted-foreground px-4 py-2">レイアウト切替</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">useIsMobile</code>
                  </td>
                  <td className="px-4 py-2">画面幅 &lt; 768px かつ タッチデバイス</td>
                  <td className="text-muted-foreground px-4 py-2">UI振る舞い（タップ操作）</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Mobile footer スペック */}
        <section>
          <h2 className="mb-4 text-lg font-medium">Mobile Footer</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            Calendar のタグクイック作成だけに使う固定フッター。ページナビゲーションは持たない。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="px-4 py-2 text-left">プロパティ</th>
                  <th className="px-4 py-2 text-left">値</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">高さ</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">h-14</code>（56px）
                  </td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">z-index</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">z-bottom-tab</code>（40）
                  </td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">セーフエリア</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">pb-safe</code>（iOS
                    ホームインジケーター）
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2">内容</td>
                  <td className="px-4 py-2">TagChipRow（Calendar のみ）</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            Calendar のメインコンテンツには{' '}
            <code className="bg-container rounded-lg px-2">pb-16</code>
            （64px）でタグフッター分の余白を確保。
          </p>
        </section>

        {/* サイドバースペック */}
        <section>
          <h2 className="mb-4 text-lg font-medium">デスクトップサイドバー</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="px-4 py-2 text-left">プロパティ</th>
                  <th className="px-4 py-2 text-left">値</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">幅（開）</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">w-64</code>（256px）
                  </td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">幅（閉）</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">w-0</code>
                    （collapse、transition-all）
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2">背景</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">bg-container</code>（Sunken
                    elevation）
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 実装パターン */}
        <section>
          <h2 className="mb-4 text-lg font-medium">実装パターン</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-sm">
            {`// base-layout-content.tsx
const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

{isMobile ? (
  <MobileLayout>{children}</MobileLayout>
) : (
  <DesktopLayout>{children}</DesktopLayout>
)}`}
          </pre>
        </section>
      </div>
    </div>
  ),
};

export const CalendarResponsive: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">カレンダーのレスポンシブ</h1>
      <p className="text-muted-foreground mb-8">
        デバイスサイズに応じたビュー制限とグリッド密度の自動調整
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* ビュー表示ルール */}
        <section>
          <h2 className="mb-4 text-lg font-medium">ビュー表示ルール</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="px-4 py-2 text-left">デバイス</th>
                  <th className="px-4 py-2 text-left">画面幅</th>
                  <th className="px-4 py-2 text-left">Day</th>
                  <th className="px-4 py-2 text-left">Multi-day 上限</th>
                  <th className="px-4 py-2 text-left">Week（7列）</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">モバイル</td>
                  <td className="px-4 py-2">&lt; 768px</td>
                  <td className="px-4 py-2">
                    <CheckCircle className="text-success size-4" />
                  </td>
                  <td className="px-4 py-2">最大3日</td>
                  <td className="px-4 py-2">
                    <XCircle className="text-destructive size-4" />
                  </td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">タブレット</td>
                  <td className="px-4 py-2">768 - 1023px</td>
                  <td className="px-4 py-2">
                    <CheckCircle className="text-success size-4" />
                  </td>
                  <td className="px-4 py-2">最大5日</td>
                  <td className="px-4 py-2">
                    <XCircle className="text-destructive size-4" />
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2">デスクトップ</td>
                  <td className="px-4 py-2">≥ 1024px</td>
                  <td className="px-4 py-2">
                    <CheckCircle className="text-success size-4" />
                  </td>
                  <td className="px-4 py-2">制限なし</td>
                  <td className="px-4 py-2">
                    <CheckCircle className="text-success size-4" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* モバイルビュー制限 */}
        <section>
          <h2 className="mb-4 text-lg font-medium">モバイルビュー制限</h2>
          <div className="space-y-2">
            <Rule type="do">モバイルでは day ビューのみ許可</Rule>
            <Rule type="do">URL直アクセスで week が指定された場合、day に強制リダイレクト</Rule>
            <Rule type="dont">モバイルで week / multi-day ビューを直接表示</Rule>
          </div>
        </section>

        {/* グリッド密度 */}
        <section>
          <h2 className="mb-4 text-lg font-medium">グリッド密度（HOUR_HEIGHT_DENSITIES）</h2>
          <p className="text-muted-foreground mb-4 text-sm">src/lib/calendar-constants.ts で定義</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="px-4 py-2 text-left">密度</th>
                  <th className="px-4 py-2 text-left">モバイル</th>
                  <th className="px-4 py-2 text-left">タブレット</th>
                  <th className="px-4 py-2 text-left">デスクトップ</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">compact</td>
                  <td className="px-4 py-2">36px</td>
                  <td className="px-4 py-2">40px</td>
                  <td className="px-4 py-2">48px</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">default</td>
                  <td className="px-4 py-2">48px</td>
                  <td className="px-4 py-2">60px</td>
                  <td className="px-4 py-2">72px</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">spacious</td>
                  <td className="px-4 py-2">64px</td>
                  <td className="px-4 py-2">80px</td>
                  <td className="px-4 py-2">96px</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 密度比較（視覚） */}
        <section>
          <h2 className="mb-4 text-lg font-medium">密度比較（default）</h2>
          <div className="flex items-end gap-6">
            <DensityBar label="Mobile" height={48} />
            <DensityBar label="Tablet" height={60} />
            <DensityBar label="Desktop" height={72} />
          </div>
        </section>

        {/* 実装コード */}
        <section>
          <h2 className="mb-4 text-lg font-medium">実装コード</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-sm">
            {`// CalendarViewRenderer.tsx
const MOBILE_MAX_DAYS = 3;
const TABLET_MAX_DAYS = 5;

const maxDays = isMobile ? MOBILE_MAX_DAYS
  : isTablet ? TABLET_MAX_DAYS
  : Infinity;

// week ビューのフォールバック
case 'week':
  if (isMobile || isTablet) {
    return <MultiDayView dayCount={maxDays} />;
  }
  return <WeekView />;`}
          </pre>
        </section>
      </div>
    </div>
  ),
};

export const TouchTargets: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">タッチターゲット</h1>
      <p className="text-muted-foreground mb-8">
        Material Design 3 / Apple HIG アクセシビリティ準拠
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* サイズ一覧 */}
        <section>
          <h2 className="mb-4 text-lg font-medium">サイズ早見表</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="px-4 py-2 text-left">サイズ</th>
                  <th className="px-4 py-2 text-left">Tailwind</th>
                  <th className="px-4 py-2 text-left">ピクセル</th>
                  <th className="px-4 py-2 text-left">用途</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">minimum</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">h-11 w-11</code>
                  </td>
                  <td className="px-4 py-2">44px</td>
                  <td className="text-muted-foreground px-4 py-2">WCAG 2.5.5最小</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">standard</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">h-12 w-12</code>
                  </td>
                  <td className="px-4 py-2">48px</td>
                  <td className="text-muted-foreground px-4 py-2">M3推奨（標準）</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">large</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded-lg px-2">h-14 w-14</code>
                  </td>
                  <td className="px-4 py-2">56px</td>
                  <td className="text-muted-foreground px-4 py-2">FAB、重要アクション</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 視覚的サンプル */}
        <section>
          <h2 className="mb-4 text-lg font-medium">サイズ比較</h2>
          <div className="flex items-end gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className="border-destructive text-destructive flex size-6 items-center justify-center rounded-lg border text-xs">
                ✕
              </div>
              <span className="text-muted-foreground text-xs">24px (NG)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="border-warning text-warning flex size-10 items-center justify-center rounded-lg border text-xs">
                △
              </div>
              <span className="text-muted-foreground text-xs">40px</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="border-success text-success flex size-11 items-center justify-center rounded-lg border text-xs">
                ○
              </div>
              <span className="text-muted-foreground text-xs">44px (min)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-lg text-xs">
                ◎
              </div>
              <span className="text-muted-foreground text-xs">48px (推奨)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-primary text-primary-foreground flex size-14 items-center justify-center rounded-lg text-xs">
                FAB
              </div>
              <span className="text-muted-foreground text-xs">56px</span>
            </div>
          </div>
        </section>

        {/* レスポンシブタッチ */}
        <section>
          <h2 className="mb-4 text-lg font-medium">レスポンシブタッチターゲット</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-sm">
            {`// ✅ モバイルで大きく、デスクトップで通常サイズ
<Button className="h-12 w-12 sm:h-10 sm:w-10">
  <Icon className="size-6 sm:size-5" />
</Button>

// ✅ SelectTriggerなど
<SelectTrigger className="h-10 w-28 sm:h-8 sm:w-32">
`}
          </pre>
        </section>

        {/* ルール */}
        <section>
          <h2 className="mb-4 text-lg font-medium">ルール</h2>
          <div className="space-y-2">
            <Rule type="do">最小タッチターゲット 44x44px</Rule>
            <Rule type="do">推奨サイズ 48x48px</Rule>
            <Rule type="do">モバイルで常時表示、デスクトップでホバー表示</Rule>
            <Rule type="dont">24px以下のタッチターゲット</Rule>
            <Rule type="dont">ホバーのみでアクセスできるUI（モバイル不可）</Rule>
          </div>
        </section>
      </div>
    </div>
  ),
};

export const HoverMobile: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">ホバー依存UIのモバイル対応</h1>
      <p className="text-muted-foreground mb-8">ホバーで表示されるUIはモバイルで常時表示に</p>

      <div className="grid max-w-5xl gap-8">
        {/* パターン */}
        <section>
          <h2 className="mb-4 text-lg font-medium">実装パターン</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-sm">
            {`// ✅ モバイルで常時表示、デスクトップでホバー時のみ
<button className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
  <TrashIcon />
</button>

// ❌ ホバーのみ（モバイルでアクセス不可）
<button className="opacity-0 group-hover:opacity-100">
`}
          </pre>
        </section>

        {/* デモ */}
        <section>
          <h2 className="mb-4 text-lg font-medium">デモ</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            ウィンドウ幅を変えて確認（640px以下でボタン常時表示）
          </p>
          <div className="bg-card border-border group flex items-center justify-between rounded-lg border p-4">
            <span>リストアイテム</span>
            <button
              type="button"
              className="text-destructive hover:bg-destructive-state-hover rounded-lg p-2 opacity-100 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
            >
              削除
            </button>
          </div>
        </section>

        {/* 固定幅のレスポンシブ化 */}
        <section>
          <h2 className="mb-4 text-lg font-medium">固定幅のレスポンシブ化</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-sm">
            {`// ✅ Tailwind標準クラス使用
<div className="w-72 sm:w-80">        // 288px → 320px
<div className="w-full max-w-sm sm:w-96">  // 全幅 → 384px

// ❌ 任意値の多用は避ける
<div className="w-[25rem]">           // → w-96
<div className="max-w-[85vw]">        // → max-w-72
`}
          </pre>
        </section>
      </div>
    </div>
  ),
};

function Rule({ type, children }: { type: 'do' | 'dont'; children: React.ReactNode }) {
  const Icon = type === 'do' ? CheckCircle : XCircle;
  const color = type === 'do' ? 'text-success' : 'text-destructive';
  const textColor = type === 'do' ? '' : 'text-muted-foreground';

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`mt-1 size-4 shrink-0 ${color}`} />
      <span className={textColor}>{children}</span>
    </div>
  );
}

function LayoutSection({ label, bg, height }: { label: string; bg: string; height: string }) {
  return (
    <div
      className={`${bg} border-border flex items-center justify-center border-b px-2 py-1 text-xs ${height}`}
    >
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function DensityBar({ label, height }: { label: string; height: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="bg-primary text-primary-foreground flex w-16 items-end justify-center rounded-lg text-xs"
        style={{ height: `${height}px` }}
      >
        {height}px
      </div>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}
