/**
 * Readiness report for Kubernetes probes in the `application/health+json` shape
 * ([draft-inadarei-api-health-check](https://datatracker.ietf.org/doc/html/draft-inadarei-api-health-check)),
 * ported from tally-split-ai. Probes are injected so the report is testable
 * without a database; `GET /readyz` supplies the real ones.
 * @module
 */
import { formatUptime } from '../../shared/utils/uptime.utils.ts'

/** A dependency that must be usable before Kubernetes routes traffic to this pod. */
export interface ReadinessProbe {
  /** Key in the response `checks`, e.g. `postgres:connection`. */
  name: string
  /** health+json component type, e.g. `datastore`. */
  componentType: string
  /** Resolve when the dependency is usable; throw or reject with the cause otherwise. */
  run: () => unknown
}

/** A failed probe and its cause, for the server log only. */
export interface ReadinessFailure {
  name: string
  error: unknown
}

/**
 * Run the probes in parallel and build the readiness response. Never throws:
 * a failing probe is reported as `fail`, and its cause is returned separately
 * in `failures` so it can be logged without leaking driver details to
 * unauthenticated callers.
 * @param probes - Dependencies to check.
 * @param uptimeSeconds - Process uptime, e.g. `process.uptime()`.
 * @param now - Report time.
 * @returns `statusCode` 200 when every probe passes, else 503; the response `body`; and the `failures`.
 */
export async function checkReadiness(probes: ReadinessProbe[], uptimeSeconds: number, now = new Date()) {
  const time = now.toISOString()
  const results = await Promise.allSettled(probes.map(async probe => probe.run()))
  const checks: Record<string, { componentType: string, status: 'pass' | 'fail', time: string }[]> = {}
  const failures: ReadinessFailure[] = []
  results.forEach((result, index) => {
    const { name, componentType } = probes[index]!
    checks[name] = [{ componentType, status: result.status === 'fulfilled' ? 'pass' : 'fail', time }]
    if (result.status === 'rejected') {
      failures.push({ name, error: result.reason })
    }
  })
  const ready = failures.length === 0
  const uptime = Math.ceil(uptimeSeconds)
  return {
    statusCode: ready ? 200 : 503,
    body: {
      status: ready ? 'pass' : 'fail',
      message: ready ? 'Server is up and running.' : 'Server is degraded.',
      timestamp: time,
      uptime,
      uptime_human_readable: formatUptime(uptime),
      checks,
    },
    failures,
  }
}

/**
 * Check that artifact storage is configured, without calling Azure, so
 * probes stay cheap and do not depend on Azure availability.
 * @param accountUrl - `NUXT_ARTIFACT_STORAGE_ACCOUNT_URL`.
 * @param container - `NUXT_ARTIFACT_STORAGE_CONTAINER`.
 * @throws Error naming the setting that is missing or not HTTPS (for the log, not the response).
 */
export function requireStorageConfiguration(accountUrl: string, container: string) {
  if (!accountUrl.startsWith('https://')) {
    throw new Error('NUXT_ARTIFACT_STORAGE_ACCOUNT_URL is not set or not HTTPS')
  }
  if (!container) {
    throw new Error('NUXT_ARTIFACT_STORAGE_CONTAINER is not set')
  }
}
