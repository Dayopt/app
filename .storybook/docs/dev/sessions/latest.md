date: 2026-04-10
commits: 25
areas: [storybook, a11y, seo, security, perf, cache, deadcode, deps, onboarding]

decisions:

- Storybook docsを.storybook/docs/に集約し、dev/(技術系)とproduct/(戦略・ビジネス系)の2階層に分離
- marketingリポの戦略ドキュメント39ファイルをStorybook MDXとして統合
- サイドバーをWelcome/Architecture/Strategy/Componentsの4階層に整理
- feature .docs.mdxのDocsサブカテゴリをGuideにリネーム
- タグ詳細の個別8本RPCを2本（getTagOverview+getTagTimeline）に統合
- rechartsをdynamic import化
- useFocusTrapフックを新規作成しカスタムモーダル3つに適用
- LabeledRowにuseId+cloneElementでaria-labelledby自動注入

conventions:

- Storybook docsの配置先: 技術系→.storybook/docs/dev/、戦略系→.storybook/docs/product/
- feature内ドキュメントのサブカテゴリ名は「Guide」（「Docs」ではない）
- server-only importはDB層・秘密鍵を扱うファイルに必須

breaking:

- src/stories/docs/ ディレクトリ廃止（→ .storybook/docs/）
- .storybook/DocsTemplate.tsx, ThemedDocsContainer.tsx 廃止（→ theme/docs.tsx に統合）
- .storybook/preview-head.html, manager-head.html 廃止（→ main.tsにインライン化）
- .storybook/vitest.setup.ts 廃止（→ src/test/storybook-setup\*.ts）
- /api/auth/logout エンドポイント削除（未使用）
- src/features/settings/components/general-settings.tsx 等旧Settings 4ファイル削除
- src/features/entry/hooks/useEntryCreate.ts, useEntryData.ts 削除
- src/features/tags/components/TagGridPicker.tsx 削除
- 未使用パッケージ13個削除（react-calendar-heatmap, react-email, @prisma/instrumentation等）
- src/platform/cache/tag-cache.ts 削除
- src/lib/pwa/index.ts, src/lib/timezone-utils.ts 削除

learned:

- LabeledRowでuseId+cloneElementを使うとaria-labelledbyを~30箇所に一括注入できる
- rechartsのdynamic import化で~130KB gzip削減可能
- WebVitalsReporterのdynamic import化で~80KB分離可能
- entries/notificationsに部分インデックス（deleted_at IS NULL）を追加するとStats系RPCが高速化する
- badges evaluateWithProgressに統合すると17→9リクエストに削減できる

files_of_note:

- .storybook/docs/welcome.mdx # Storybook新ランディングページ
- .storybook/theme/docs.tsx # DocsTemplate+ThemedDocsContainerの統合先
- .storybook/decorators/index.tsx # provider+storeMock集約
- src/hooks/useFocusTrap.ts # 新規フック（ConfirmDialog/TagCreate/TagMerge用）
- src/features/stats/hooks/useTagDetailData.ts # 新規（統合RPC用hook）

next:

- [ ] src/platform/ → src/lib/ の統合（platform/にまだ残存）
- [ ] Storybook sidebar順序の微調整（feature docs Guideリネーム後の確認）
