import { expect, test } from 'vitest'
import { planP1, uploadedRecord } from '../../../tests/support/artifact-fixtures.ts'
import { artifactInfoSchema } from '../../../shared/utils/zod-schemas/artifact.schema.ts'
import { toArtifactInfo } from './http.utils.ts'

const id = '40000000-0000-4000-8000-000000000001'

test('uploaded metadata has size and hash but no internal reference', () => {
  const info = toArtifactInfo({
    ...uploadedRecord(id, planP1),
    metadata: {
      contentType: 'text/markdown',
      title: 'Plan',
    },
    details: 'Done',
  })
  expect(artifactInfoSchema.parse(info)).toStrictEqual(info)
  expect(info).toMatchObject({
    id,
    name: 'plan',
    state: 'uploaded',
    sizeBytes: 5,
    title: 'Plan',
    details: 'Done',
  })
  expect(info).not.toHaveProperty('reference')
  expect(info).not.toHaveProperty('kind')
})

test('reserved and failed metadata omit size and hash', () => {
  const reserved = toArtifactInfo({
    ...uploadedRecord(id, planP1),
    state: 'reserved',
    sizeBytes: null,
    sha256: null,
  })
  expect(artifactInfoSchema.parse(reserved)).toStrictEqual(reserved)
  expect(reserved).not.toHaveProperty('sizeBytes')
  const failed = toArtifactInfo({
    ...uploadedRecord(id, planP1),
    state: 'failed',
    sizeBytes: null,
    sha256: null,
    details: 'Azure returned 403',
  })
  expect(artifactInfoSchema.parse(failed)).toStrictEqual(failed)
  expect(failed).toMatchObject({
    state: 'failed',
    details: 'Azure returned 403',
  })
  expect(failed).not.toHaveProperty('sha256')
})
