// 構造化ログ（Edge Function 用）
// Edge Functions は Deno 上で動作し @/lib/logger を使えないため console を直接使用

export function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
): void {
  const entry = { level, message, timestamp: new Date().toISOString(), ...meta };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
