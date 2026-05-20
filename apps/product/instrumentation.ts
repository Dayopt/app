/**
 * Next.js Instrumentation Hook
 * サーバー起動時にSentry SDKを初期化
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */

export async function register() {
  // Node.jsランタイム（サーバーサイド）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  // Edgeランタイム（Middleware、Edge API Routes）
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

/**
 * サーバーサイドでキャッチされなかったエラーをSentryに報告
 */
export const onRequestError = async (
  err: Error,
  request: {
    path: string
    method: string
    headers: Record<string, string>
  },
  context: {
    routerKind: 'Pages Router' | 'App Router'
    routeType: 'render' | 'route' | 'action' | 'middleware'
    routePath: string
    revalidateReason: 'on-demand' | 'stale' | undefined
    renderSource: 'react-server-components' | 'react-server-components-payload' | 'server-rendering' | undefined
  }
) => {
  const { captureRequestError } = await import('@sentry/nextjs')

  captureRequestError(err, request, context)
}
