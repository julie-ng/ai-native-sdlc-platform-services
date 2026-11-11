/**
 * Private authentication configuration validation shared by issuance and verification.
 * @module
 */
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

/**
 * Require a signing key, database URL and a finite positive expiry window.
 * @param event - Request whose private runtime settings supply signing and expiry configuration.
 * @returns The signing key and validated positive expiry window in minutes.
 * @throws H3Error 503 for missing or invalid server configuration, without disclosing settings.
 */
export function requireStepTokenConfiguration(event: H3Event) {
  const {
    hmacKey, hmacTokenExpiryMinutes, databaseUrl,
  } = useRuntimeConfig(event)
  const expiryMinutes = Number(hmacTokenExpiryMinutes)
  if (!hmacKey || !databaseUrl || !Number.isFinite(expiryMinutes) || expiryMinutes <= 0
    || !Number.isFinite(new Date(Date.now() + expiryMinutes * 60_000).getTime())) {
    throw createError({
      statusCode: 503,
      message: 'Authentication is not configured',
    })
  }
  return {
    key: hmacKey,
    expiryMinutes,
  }
}
