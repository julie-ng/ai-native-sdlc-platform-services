import { sql } from 'drizzle-orm'
import { useDB } from '#server/db/use-db'
import { checkReadiness, requireStorageConfiguration } from '#server/utils/readiness.utils'
import { useLogger } from '#server/utils/use-logger'

// Kubernetes readiness probe: public, outside /api, no caller guard, excluded from the access log.
// 200 when PostgreSQL answers and artifact storage is configured, else 503. Causes are logged,
// never returned. The storage check reads configuration only; it does not call Azure.
export default defineEventHandler(async (event) => {
  const { artifactStorageAccountUrl, artifactStorageContainer } = useRuntimeConfig(event)
  const { statusCode, body, failures } = await checkReadiness([
    {
      name: 'postgres:connection',
      componentType: 'datastore',
      run: () => useDB().execute(sql`select 1`),
    },
    {
      name: 'azure-storage:configuration',
      componentType: 'component',
      run: () => requireStorageConfiguration(artifactStorageAccountUrl, artifactStorageContainer),
    },
  ], process.uptime())
  for (const { name, error } of failures) {
    // Driver errors arrive wrapped (e.g. DrizzleQueryError); surface the cause's code, e.g. ECONNREFUSED.
    const cause = error instanceof Error ? error.cause : undefined
    const code = cause instanceof Object && 'code' in cause ? cause.code : undefined
    useLogger('readyz').error({ check: name, code, err: error }, 'Readiness check failed')
  }
  setResponseStatus(event, statusCode)
  setResponseHeader(event, 'Content-Type', 'application/health+json')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return body
})
