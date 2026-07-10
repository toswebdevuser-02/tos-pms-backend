/* Minimal monitoring wrapper (Phase 6 baseline). */

export function initMonitoring(): void {
  // Placeholder for Sentry/APM hookup. Keep no-op until DSN is configured.
}

export function logTiming(label: string, ms: number): void {
  // eslint-disable-next-line no-console
  console.log(`[timing] ${label}: ${ms}ms`)
}


