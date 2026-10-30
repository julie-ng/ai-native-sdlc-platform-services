import { assert, expect, test } from 'vitest'
import { createInMemoryRepository, createUrlIssuerSpy } from '../../../tests/support/artifact-fakes.ts'
import { contexts, planP2, uploadedRecord } from '../../../tests/support/artifact-fixtures.ts'
import {
  artifactInfoSchema, completeArtifactResponseSchema, createArtifactResponseSchema,
  listArtifactsResponseSchema, newArtifactResponseSchema,
} from '../../../shared/utils/zod-schemas/artifact.schema.ts'
import { downloadSasSchema } from '../../../shared/utils/zod-schemas/sas.schema.ts'
import { createArtifactService } from './service.utils.ts'

const plan = { name: 'plan', contentType: 'text/markdown', title: 'Implementation plan' }
const report = { state: 'uploaded', sizeBytes: 5, sha256: 'a'.repeat(64) } as const
const p2Id = '40000000-0000-4000-8000-000000000002'

function setup() {
  const { repository, records } = createInMemoryRepository([uploadedRecord(p2Id, planP2)])
  const urls = createUrlIssuerSpy()
  return { service: createArtifactService({ repository, urls }), repository, records, urls }
}

test('planner to coder handoff: register, report upload, discover, inspect, download', async () => {
  const { service, urls } = setup()
  const created = await service.createArtifact(contexts['planner-p1'], plan)
  assert(created.ok)
  expect(created.status).toBe(201)
  expect(newArtifactResponseSchema.parse(created.body)).toStrictEqual(created.body)
  expect(Object.keys(created.body).sort()).toStrictEqual(['id', 'state', 'upload'])
  expect(created.body.upload.headers['Content-Type']).toBe('text/markdown')
  const { id } = created.body

  const completed = await service.completeArtifact(contexts['planner-p1'], id, report)
  assert(completed.ok)
  expect(completed.body).toStrictEqual(completeArtifactResponseSchema.parse({ id, state: 'uploaded' }))

  const listed = await service.listArtifacts(contexts['coder-c1'])
  assert(listed.ok)
  expect(listArtifactsResponseSchema.parse(listed.body).artifacts.map(artifact => artifact.id)).toStrictEqual([id])

  const info = await service.getArtifact(contexts['coder-c1'], id)
  assert(info.ok)
  const parsed = artifactInfoSchema.parse(info.body)
  assert(parsed.state === 'uploaded')
  expect(parsed).toMatchObject({ id, name: 'plan', title: 'Implementation plan', sizeBytes: 5, sha256: 'a'.repeat(64) })
  expect(info.body).not.toHaveProperty('reference')

  const sas = await service.getArtifactSas(contexts['coder-c1'], id)
  assert(sas.ok)
  expect(downloadSasSchema.parse(sas.body).method).toBe('GET')
  // Discovery and metadata reads never sign.
  expect(urls.issueUpload).toHaveBeenCalledTimes(1)
  expect(urls.issueDownload).toHaveBeenCalledTimes(1)
})

test('repeated POSTs reuse the artifact, replace descriptive metadata and sign a fresh URL', async () => {
  const { service, urls } = setup()
  const first = await service.createArtifact(contexts['planner-p1'], plan)
  assert(first.ok)
  await service.completeArtifact(contexts['planner-p1'], first.body.id, report)
  const again = await service.createArtifact(contexts['planner-p1-later-execution'], { name: 'plan', contentType: 'text/plain' })
  assert(again.ok)
  expect(again.status).toBe(200)
  expect(createArtifactResponseSchema.parse(again.body)).toMatchObject({ id: first.body.id, state: 'uploaded' })
  expect(again.body.upload.headers['Content-Type']).toBe('text/plain')
  expect(urls.issueUpload).toHaveBeenCalledTimes(2)

  const info = await service.getArtifact(contexts['coder-c1'], first.body.id)
  assert(info.ok)
  // Last write wins; omitted optional fields are cleared rather than merged.
  expect(info.body).toMatchObject({ contentType: 'text/plain', state: 'uploaded' })
  expect(info.body).not.toHaveProperty('title')
  expect(info.body.updatedAt > info.body.createdAt).toBe(true)
})

test('completion reports replace the latest size and hash', async () => {
  const { service } = setup()
  const created = await service.createArtifact(contexts['planner-p1'], plan)
  assert(created.ok)
  await service.completeArtifact(contexts['planner-p1'], created.body.id, report)
  await service.completeArtifact(contexts['planner-p1'], created.body.id, { ...report, sizeBytes: 13, sha256: 'b'.repeat(64) })
  const info = await service.getArtifact(contexts['coder-c1'], created.body.id)
  assert(info.ok)
  expect(info.body).toMatchObject({ sizeBytes: 13, sha256: 'b'.repeat(64) })
})

test('visible artifact with the wrong action is 403', async () => {
  const { service, repository, urls } = setup()
  const created = await service.createArtifact(contexts['planner-p1'], plan)
  assert(created.ok)
  // Planner can write its plan but not read it; coder can read but not write.
  for (const result of [
    await service.getArtifact(contexts['planner-p1'], created.body.id),
    await service.getArtifactSas(contexts['planner-p1'], created.body.id),
    await service.completeArtifact(contexts['coder-c1'], created.body.id, report),
  ]) {
    expect(result).toStrictEqual({ ok: false, status: 403, message: 'Forbidden' })
  }
  expect(repository.acknowledge).not.toHaveBeenCalled()
  expect(urls.issueDownload).not.toHaveBeenCalled()
})

test('missing or invisible artifacts are the same 404', async () => {
  const { service, repository, urls } = setup()
  const missing = '40000000-0000-4000-8000-000000000099'
  for (const result of [
    await service.getArtifact(contexts['coder-c1'], missing),
    // P2's plan exists but is not bound to C1 or P1.
    await service.getArtifact(contexts['coder-c1'], p2Id),
    await service.getArtifactSas(contexts['coder-c1'], p2Id),
    await service.completeArtifact(contexts['planner-p1'], p2Id, report),
    await service.getArtifact(contexts['unknown-task'], p2Id),
    // Coders own no plan output; planners own only `plan`.
    await service.createArtifact(contexts['coder-c1'], plan),
    await service.createArtifact(contexts['planner-p1'], { ...plan, name: 'other' }),
  ]) {
    expect(result).toStrictEqual({ ok: false, status: 404, message: 'Artifact not found' })
  }
  expect(repository.upsert).not.toHaveBeenCalled()
  expect(repository.acknowledge).not.toHaveBeenCalled()
  expect(urls.issueUpload).not.toHaveBeenCalled()
  expect(urls.issueDownload).not.toHaveBeenCalled()
})

test('download SAS requires a reported upload', async () => {
  const { service, urls } = setup()
  const created = await service.createArtifact(contexts['planner-p1'], plan)
  assert(created.ok)
  const info = await service.getArtifact(contexts['coder-c1'], created.body.id)
  assert(info.ok)
  expect(info.body.state).toBe('reserved')
  expect(info.body).not.toHaveProperty('sizeBytes')
  expect(await service.getArtifactSas(contexts['coder-c1'], created.body.id)).toMatchObject({ ok: false, status: 409 })
  expect(urls.issueDownload).not.toHaveBeenCalled()
})

test('discovery lists only readable records, in creation order', async () => {
  const { service } = setup()
  const created = await service.createArtifact(contexts['planner-p1'], plan)
  assert(created.ok)
  const several = await service.listArtifacts(contexts['coder-multiple-inputs'])
  assert(several.ok)
  expect(several.body.artifacts.map(artifact => artifact.id)).toStrictEqual([p2Id, created.body.id])
  for (const name of ['planner-p1', 'coder-no-inputs', 'unknown-task'] as const) {
    expect(await service.listArtifacts(contexts[name])).toStrictEqual({ ok: true, status: 200, body: { artifacts: [] } })
  }
})
