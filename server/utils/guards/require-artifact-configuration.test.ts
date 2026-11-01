import { beforeEach, expect, test, vi } from 'vitest'
import type { H3Event } from 'h3'
import { requireArtifactConfiguration } from './require-artifact-configuration.ts'

const config = vi.hoisted(() => ({ databaseUrl: '', artifactStorageAccountUrl: '', artifactStorageContainer: '' }))
vi.mock('nitropack/runtime', () => ({ useRuntimeConfig: () => config }))

const event = {} as H3Event

beforeEach(() => {
  Object.assign(config, {
    databaseUrl: 'postgres://localhost/test',
    artifactStorageAccountUrl: 'https://account.blob.core.windows.net',
    artifactStorageContainer: 'artifacts',
  })
})

test('passes when the database and storage are configured', () => {
  expect(() => requireArtifactConfiguration(event)).not.toThrow()
})

test('any missing or non-HTTPS setting is the same 503, without naming it', () => {
  for (const missing of [
    { databaseUrl: '' },
    { artifactStorageAccountUrl: '' },
    { artifactStorageAccountUrl: 'http://account.blob.core.windows.net' },
    { artifactStorageContainer: '' },
  ]) {
    Object.assign(config, missing)
    expect(() => requireArtifactConfiguration(event))
      .toThrow(expect.objectContaining({ statusCode: 503, message: 'Artifact service is not configured' }))
  }
})
