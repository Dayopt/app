# Next.js パフォーマンス最適化

Dayoptで実装済みのNext.js 15 App Router向けパフォーマンス最適化の技術リファレンス。

---

## 実装済み最適化一覧

| カテゴリ        | 実装内容                                     | ファイル                       |
| --------------- | -------------------------------------------- | ------------------------------ |
| PPR             | Partial Prerendering有効化                   | `next.config.mjs`              |
| Server Prefetch | tRPC Server-side helpers + HydrationBoundary | `src/lib/trpc/server.ts`       |
| Router Cache    | staleTimes設定                               | `next.config.mjs`              |
| Link最適化      | ネットワーク条件に応じたprefetch             | `nav-main.tsx`                 |
| LCP最適化       | priority属性追加                             | エラーページ各種               |
| SW最適化        | キャッシュ自動バージョニング                 | `useServiceWorker.ts`, `sw.js` |
| Bundle最適化    | optimizePackageImports拡張                   | `next.config.mjs`              |
| 遅延ロード      | Novel Editor dynamic import                  | `PlanInspectorContent.tsx`     |

---

## Phase 1: PPR + Server-side Prefetch

### PPR (Partial Prerendering)

```js
// next.config.mjs
experimental: {
  ppr: true,
  staleTimes: {
    dynamic: 30,
    static: 180,
  },
}
```

**効果**: 静的シェルを即座に表示、動的部分を後からストリーミング。FCPの大幅改善。

### tRPC Server-side Prefetch

```tsx
// src/app/[locale]/(app)/calendar/[view]/page.tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { createServerHelpers } from '@/lib/trpc/server';

export default async function CalendarPage() {
  const helpers = await createServerHelpers();

  await helpers.entries.list.prefetch();
  await helpers.tags.list.prefetch();

  return (
    <HydrationBoundary state={dehydrate(helpers.queryClient)}>
      <CalendarClient />
    </HydrationBoundary>
  );
}
```

**効果**: 初回レンダリング時にデータが既にキャッシュ済み。クライアントでの追加フェッチ不要。

---

## Phase 2: Link Prefetch最適化

### ネットワーク条件に応じたprefetch

```tsx
const shouldPrefetch = useMemo(() => {
  if (typeof navigator === 'undefined') return true;

  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection;

  if (connection?.saveData) return false;
  if (connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') {
    return false;
  }

  return true;
}, []);

<Link href={item.url} prefetch={shouldPrefetch}>
```

**効果**: モバイルデータ節約、遅いネットワークでの帯域消費削減。

---

## Phase 3: LCP最適化

### priority属性

```tsx
<Image
  src="..."
  alt="..."
  width={960}
  height={540}
  priority // LCP画像に追加
  className="..."
/>
```

**効果**: ファーストビューの大きな画像を優先ロード。LCP改善。

---

## Phase 4: Service Worker最適化

### キャッシュ自動バージョニング

```ts
// src/hooks/useServiceWorker.ts
const swVersion =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  '';
const swUrl = swVersion ? `/sw.js?v=${swVersion}` : '/sw.js';
```

**効果**: デプロイ時にSWが自動更新、古いキャッシュの自動クリーンアップ。

---

## Phase 5: Bundle最適化

### optimizePackageImports

```js
// next.config.mjs
experimental: {
  optimizePackageImports: [
    'lucide-react',
    '@radix-ui/react-icons',
    'date-fns',
    'framer-motion',
    '@tanstack/react-query',
    '@tiptap/react',
    '@tiptap/core',
    '@tiptap/starter-kit',
    '@tiptap/extension-placeholder',
  ],
}
```

### Heavy Component遅延ロード

```tsx
const NovelDescriptionEditor = dynamic(
  () => import('../shared/NovelDescriptionEditor').then((mod) => mod.NovelDescriptionEditor),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground min-h-8 px-2 py-1 text-sm">読み込み中...</div>
    ),
  },
);
```

**効果**: 初期バンドルサイズ約300KB削減。

---

## 意図的にスキップした最適化

| 項目                 | 理由                                                |
| -------------------- | --------------------------------------------------- |
| Entry Suspense細分化 | EntryBoardView内部で既にisPending実装済み           |
| Settings遅延ロード   | Next.jsがルート別に自動コード分割済み               |
| React.memo追加       | 工数対効果が低い（既にuseMemo/useCallback実装済み） |
| Edge Runtime         | 既存構成で十分、複雑性増加のリスク                  |

---

## 計測方法

### Lighthouse（ローカル）

```bash
npm run build && npm run start
# 別ターミナル
npx lighthouse http://localhost:3000 --view
```

### Vercel Analytics

本番環境では Vercel Speed Insights でリアルユーザーメトリクスを確認。

---

## 関連ページ

- [パフォーマンス](../quality/performance.md)
- [バンドル監視](../quality/bundle-monitoring.md)

---

**最終更新**: 2026-02-12 | **バージョン**: v1.0
