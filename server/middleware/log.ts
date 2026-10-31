import { useLogger } from '#server/utils/use-logger'

// Global HTTP access log, one JSON line per finished response (ported from tally-split-ai).
// Global on purpose: the explicit-guard rule applies to authentication, not logging.
// Logs only method, path, query, status and duration: never bodies, headers or caller context.
export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  // /readyz is skipped so Kubernetes probes do not flood the logs.
  if (url.pathname === '/readyz') {
    return
  }
  const start = Date.now()
  event.node.res.on('finish', () => {
    useLogger('http').info({
      method: event.method,
      path: url.pathname,
      search: url.search || undefined,
      status: event.node.res.statusCode,
      duration: Date.now() - start,
    })
  })
})
