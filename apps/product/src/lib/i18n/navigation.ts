import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * next-intlのナビゲーションユーティリティ
 *
 * これらを使用することで、言語プレフィックスを自動的に処理できます。
 *
 * @example
 * ```tsx
 * import { Link, useRouter, usePathname } from '@/lib/i18n/navigation'
 *
 * // Link: <Link href="/about">About</Link>
 * //       → /ja/about または /en/about（現在の言語に応じて）
 *
 * // useRouter: router.push('/about')
 * //            → 現在の言語でナビゲート
 *
 * // usePathname: /ja/about → /about（言語プレフィックスなし）
 * ```
 */
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
