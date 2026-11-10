import { beforeEach, expect, test, vi } from 'vitest'
import type { H3Event } from 'h3'
import { requireAdminToken } from './require-admin-token.ts'

const config = vi.hoisted(() => ({ adminToken: 'test-admin-token' }))
const log = vi.hoisted(() => vi.fn())
vi.mock('nitropack/runtime', () => ({ useRuntimeConfig: () => config }))
vi.mock('../log-security-event.utils.ts', () => ({ logSecurityEvent: log }))
const eventFor = (authorization?: string) => ({ node: { req: { headers: { authorization } } }, context: {} }) as unknown as H3Event
beforeEach(() => {
  config.adminToken = 'test-admin-token'
  log.mockClear()
})

test('accepts the admin bearer credential without a security rejection', () => {
  expect(() => requireAdminToken(eventFor('Bearer test-admin-token'))).not.toThrow()
  expect(log).not.toHaveBeenCalled()
})

test('missing, malformed and wrong admin tokens return the same 401 and log once', () => {
  for (const header of [undefined, '', 'Basic test-admin-token', 'Bearer ', 'Bearer wrong-token', 'Bearer test-admin-token extra']) {
    log.mockClear()
    const event = eventFor(header)
    expect(() => requireAdminToken(event)).toThrow(expect.objectContaining({ statusCode: 401, message: 'Unauthorized' }))
    expect(log).toHaveBeenCalledExactlyOnceWith(event, header === 'Bearer wrong-token' ? 'invalid_admin_token' : 'missing_admin_token')
  }
})

test('missing admin configuration is a generic 503', () => {
  config.adminToken = ''
  expect(() => requireAdminToken(eventFor())).toThrow(expect.objectContaining({ statusCode: 503, message: 'Authentication is not configured' }))
  expect(log).not.toHaveBeenCalled()
})
