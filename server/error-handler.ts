import { getRequestURL, send, setResponseHeaders, setResponseStatus } from 'h3'
import { defineNitroErrorHandler } from 'nitropack/runtime'
import { useLogger } from '#server/utils/use-logger'

// First Nitro error handler, prepended in nuxt.config.ts so Nuxt's handler still runs after it.
// Unexpected (unhandled or fatal) errors are logged as one structured JSON line. Expected
// createError() responses, including deliberate 503s, are not; the access log records their
// status. pino's `err` serializer keeps only
// the message and stack of `error.cause`, not its properties (e.g. SDK request headers).
//
// Nitro's built-in handler would also print these errors as plain text. For API requests in
// production, which Nuxt hands to that built-in handler, write the same JSON response here
// with `silent: true` instead. Other requests and dev mode fall through unchanged.
// Relies on Nitro 2 / Nuxt internals; recheck on upgrades (#27).
export default defineNitroErrorHandler(async (error, event, { defaultHandler }) => {
  const { pathname } = getRequestURL(event)
  if (error.unhandled || error.fatal) {
    useLogger('http').error({ err: error, method: event.method, path: pathname, status: error.statusCode }, 'Request failed')
  }
  if (import.meta.dev || !pathname.startsWith('/api/') || event.headers.get('accept')?.includes('text/html')) {
    return
  }
  const response = await defaultHandler(error, event, { silent: true })
  setResponseHeaders(event, response.headers)
  setResponseStatus(event, response.status, response.statusText)
  return send(event, JSON.stringify(response.body, null, 2))
})
