/** Explicit admin authentication for run creation. @module */
import { createError, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { equalAdminToken } from '../auth/step-token.utils.ts'
import { logSecurityEvent } from '../log-security-event.utils.ts'

/**
 * Require the configured admin Bearer credential before creating a run.
 * @throws H3Error 401 for missing/invalid credentials, 503 when no admin token is configured.
 */
export function requireAdminToken(event: H3Event) {
  const { adminToken } = useRuntimeConfig(event)
  if (!adminToken) {
    throw createError({ statusCode: 503, message: 'Authentication is not configured' })
  }
  const token = /^Bearer ([^\s]+)$/i.exec(getHeader(event, 'authorization') ?? '')?.[1]
  if (!token || !equalAdminToken(token, adminToken)) {
    logSecurityEvent(event, token ? 'invalid_admin_token' : 'missing_admin_token')
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
}
