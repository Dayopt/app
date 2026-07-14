---
status: done
last_verified: 2026-07-14
code: packages/i18n
---

# i18n-adapter-unification — product / web の next-intl 基盤を共有する

GitHub issue #1533 の実装設計。product と web に重複している routing / navigation と request locale 解決を共有 package に集約し、locale constants と app 固有 message loading の責務を分離する。routing・両 app・CI を横断するため大規模変更として扱う。

## 1. Goal

`@dayopt/config` の locale constants を唯一の source of truth としたまま、next-intl の framework adapter を `@dayopt/i18n` の1実装へ集約し、両 app の URL・locale・message loading 挙動を維持する。

## 2. Target Architecture

```text
apps/product, apps/web
  -> @dayopt/i18n/{routing,navigation,request}
       -> @dayopt/config
       -> next-intl (peer dependency)

apps/product/src/lib/i18n/request.ts
  -> product namespace discovery / logger

apps/web/src/platform/i18n/request.ts
  -> web fixed namespaces / warning
```

- `@dayopt/config`: locale 一覧・default locale・URL prefix strategy。Next.js / React / next-intl 非依存を維持する。
- `@dayopt/i18n`: `defineRouting`、`createNavigation`、request locale fallback を所有する。client/server code が混ざらないよう subpath export のみ公開する。
- app-local `request.ts`: next-intl plugin entrypoint と message loader を所有する。message file の探索方法は共有しない。

## 3. Public Interfaces

| Subpath                   | Exports                                                       | Runtime            |
| ------------------------- | ------------------------------------------------------------- | ------------------ |
| `@dayopt/i18n/routing`    | `routing`, `Locale`                                           | universal          |
| `@dayopt/i18n/navigation` | `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname` | Next.js navigation |
| `@dayopt/i18n/request`    | `MessageLoader`, `createI18nRequestConfig`                    | server             |

`MessageLoader` は `(locale: Locale) => Promise<Record<string, unknown>>`。request factory は `requestLocale` が supported locale ならその値を、missing / invalid なら `DEFAULT_LOCALE` を loader に渡す。

root barrel は作らない。routing/navigation consumer は package subpath を直接 import し、旧 app-local routing/navigation shim は削除する。

## 4. App-specific Behavior

- product は `messages/{locale}` を filesystem scan し、namespace 一覧を process 内 cache する。load failure は既存 logger へ送る。
- web は `common`, `legal`, `marketing`, `search` の固定 namespace を dynamic import する。load failure の既存 warning は維持する。
- next-intl plugin が参照する各 app の `request.ts` path は変更しない。
- locale、default locale、`localePrefix`、message JSON、UI copy は変更しない。

## 5. Test and CI Contract

- package unit: routing constants、valid locale、invalid / missing fallback、loader input。
- product E2E: 英日 login rendering と locale-aware Link の prefix 保持。未認証で操作できる locale switch UI は追加しない。
- web E2E: footer LanguageSwitcher で `/` → `/ja` → `/` を操作し、URL と hero copy を確認する。
- root `test:run` / `test:e2e:smoke` と CI unit / web-e2e job の両方へ接続し、既存 product E2E は維持する。

## 6. Reversibility Table

| 変更                            | 可逆性      | 根拠                                      |
| ------------------------------- | ----------- | ----------------------------------------- |
| shared package / direct imports | `[minutes]` | internal code のみで commit revert 可能   |
| request factory adoption        | `[minutes]` | app 固有 loader と plugin path を保持する |
| unit / E2E / CI wiring          | `[minutes]` | repo-only configuration                   |

schema・data migration・external contract・公開 URL の変更はなく、不可逆要素はない。

## 7. Existing Code to Reuse

- `packages/config/src/i18n.ts` の `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LOCALE_PREFIX`, `Locale`
- product `request.ts` の namespace discovery / cache / logger
- web `request.ts` の固定 `NAMESPACES` loader
- web `LanguageSwitcher` と product Playwright harness

## 8. What I'm Not Doing

- product / web の message loading strategy 統一
- `@dayopt/config` への framework dependency 追加
- locale・message・UI copy・next-intl version の変更
- product への新しい locale switch UI 追加
- i18n 以外の package quality gate 整備
