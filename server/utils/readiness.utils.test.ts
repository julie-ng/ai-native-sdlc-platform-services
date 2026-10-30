import { expect, test } from 'vitest'
import { checkReadiness, requireStorageConfiguration } from './readiness.utils.ts'
import type { ReadinessProbe } from './readiness.utils.ts'

const now = new Date('2026-10-30T12:00:00.000Z')
const pass = (name: string): ReadinessProbe => ({ name, componentType: 'datastore', run: async () => {} })

test('200 with passing checks when every probe passes', async () => {
  const report = await checkReadiness([pass('postgres:connection'), pass('azure-storage:configuration')], 1233.4, now)
  expect(report).toEqual({
    statusCode: 200,
    body: {
      status: 'pass',
      message: 'Server is up and running.',
      timestamp: '2026-10-30T12:00:00.000Z',
      uptime: 1234,
      uptime_human_readable: '20 minutes and 34 seconds',
      checks: {
        'postgres:connection': [{ componentType: 'datastore', status: 'pass', time: '2026-10-30T12:00:00.000Z' }],
        'azure-storage:configuration': [{ componentType: 'datastore', status: 'pass', time: '2026-10-30T12:00:00.000Z' }],
      },
    },
    failures: [],
  })
})

test('503 for rejecting or throwing probes; causes are returned for logging, not in the body', async () => {
  const refused = new Error('connect ECONNREFUSED 10.0.0.5:5432')
  const missing = new Error('NUXT_ARTIFACT_STORAGE_CONTAINER is not set')
  const report = await checkReadiness([
    { name: 'postgres:connection', componentType: 'datastore', run: () => Promise.reject(refused) },
    { name: 'azure-storage:configuration', componentType: 'component', run: () => { throw missing } },
    pass('other'),
  ], 5, now)

  expect(report.statusCode).toBe(503)
  expect(report.body.status).toBe('fail')
  expect(report.body.message).toBe('Server is degraded.')
  expect(report.body.checks['postgres:connection']![0]!.status).toBe('fail')
  expect(report.body.checks['azure-storage:configuration']![0]!.status).toBe('fail')
  expect(report.body.checks.other![0]!.status).toBe('pass')
  expect(report.failures).toEqual([
    { name: 'postgres:connection', error: refused },
    { name: 'azure-storage:configuration', error: missing },
  ])
  expect(JSON.stringify(report.body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|NUXT_/)
})

test('storage configuration requires an HTTPS account URL and a container', () => {
  expect(() => requireStorageConfiguration('https://account.blob.core.windows.net', 'artifacts')).not.toThrow()
  expect(() => requireStorageConfiguration('', 'artifacts')).toThrow('NUXT_ARTIFACT_STORAGE_ACCOUNT_URL')
  expect(() => requireStorageConfiguration('http://account.blob.core.windows.net', 'artifacts')).toThrow('NUXT_ARTIFACT_STORAGE_ACCOUNT_URL')
  expect(() => requireStorageConfiguration('https://account.blob.core.windows.net', '')).toThrow('NUXT_ARTIFACT_STORAGE_CONTAINER')
})
