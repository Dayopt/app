type DependencyHealthStatus = 'ok' | 'error' | 'warning' | 'skipped';
export type OverallHealthStatus = 'healthy' | 'unhealthy' | 'degraded';

/** skipped を除いた依存サービスの結果から公開 health status を決める。 */
export function resolveHealthStatus(
  checkResults: readonly DependencyHealthStatus[],
): OverallHealthStatus {
  const activeResults = checkResults.filter((status) => status !== 'skipped');

  if (activeResults.includes('error')) {
    return 'unhealthy';
  }

  if (activeResults.includes('warning')) {
    return 'degraded';
  }

  return 'healthy';
}
