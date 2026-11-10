/** Security rejection logging with request metadata and an explicit context allowlist. @module */
import { getHeader, getRequestIP, getRequestURL } from 'h3'
import type { H3Event } from 'h3'
import { useLogger } from './use-logger.ts'

/** Only validated IDs and server-derived actions belong in security context, never raw credentials. */
export interface SecurityContext {
  runId?: string
  stepId?: string
  requiredActions?: readonly string[]
  grantedActions?: readonly string[]
}

/** Record one rejection; omit queries, bodies, authorization headers and arbitrary context properties. */
export function logSecurityEvent(event: H3Event, reason: string, context: SecurityContext = {}) {
  useLogger('security').warn({
    reason,
    ip: getRequestIP(event),
    userAgent: getHeader(event, 'user-agent'),
    method: event.method,
    path: getRequestURL(event).pathname,
    runId: context.runId,
    stepId: context.stepId,
    requiredActions: context.requiredActions,
    grantedActions: context.grantedActions,
  }, 'Request denied')
}
