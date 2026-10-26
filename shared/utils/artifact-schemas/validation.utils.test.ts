import assert from 'node:assert/strict'
import { test } from 'node:test'
import spec from '../../../docs/api/artifact.openapi.json' with { type: 'json' }
import { examples } from '../../../tests/support/artifact-fixtures.ts'
import { artifactValidator, isArtifactValue } from './validation.utils.ts'
import type { ArtifactSchemaName } from './validation.utils.ts'

interface Media {
  schema: { $ref: string }
  examples: Record<string, { value: unknown }>
}
interface Response {
  content: { 'application/json': Media }
}
interface Operation {
  operationId: string
  requestBody?: { content: { 'application/json': Media } }
  parameters?: { schema: { $ref: string }, example: unknown }[]
  responses: Record<string, Response | { $ref: string }>
}
// The contract checker validates these fixture structures separately.
const paths = spec.paths as unknown as Record<string, Record<string, Operation>>
const operations = Object.values(paths).flatMap(Object.values)
const schemaFor = (schema: { $ref: string }) => schema.$ref.split('/').at(-1) as ArtifactSchemaName
function responseMedia(response: Response | { $ref: string }): Media {
  if ('$ref' in response) {
    const key = response.$ref.split('/').at(-1) as keyof typeof spec.components.responses
    return spec.components.responses[key].content['application/json']
  }
  return response.content['application/json']
}
function schemaForExample(operationId: string, part: string, status = 200): ArtifactSchemaName {
  const operation = operations.find(op => op.operationId === operationId)
  assert(operation)
  if (part === 'parameters') {
    return 'ArtifactIdParameters'
  }
  if (part === 'body') {
    assert(operation.requestBody)
    return schemaFor(operation.requestBody.content['application/json'].schema)
  }
  return schemaFor(responseMedia(operation.responses[String(status)]!).schema)
}

// Exercise runtime exports, not a separate Ajv instance in the contract checker.
for (const example of examples.requests) {
  test(`runtime contract request/response: ${example.id}`, () => {
    if ('body' in example) {
      assert(isArtifactValue(schemaForExample(example.operationId, 'body'), example.body))
    }
    if ('parameters' in example) {
      assert(isArtifactValue('ArtifactIdParameters', example.parameters))
    }
    assert(isArtifactValue(schemaForExample(example.operationId, 'response', example.responseStatus), example.response))
  })
}

for (const [path, methods] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    test(`runtime OpenAPI examples: ${method} ${path}`, () => {
      if (operation.requestBody) {
        const media = operation.requestBody.content['application/json']
        for (const example of Object.values(media.examples)) {
          assert(isArtifactValue(schemaFor(media.schema), example.value))
        }
      }
      for (const parameter of operation.parameters ?? []) {
        assert(isArtifactValue(schemaFor(parameter.schema), parameter.example))
      }
      for (const response of Object.values(operation.responses)) {
        const media = responseMedia(response)
        for (const example of Object.values(media.examples)) {
          assert(isArtifactValue(schemaFor(media.schema), example.value))
        }
      }
    })
  }
}

for (const example of examples.negativeExamples) {
  test(`runtime rejects contract example: ${example.id}`, () => {
    const status = 'responseStatus' in example ? example.responseStatus : undefined
    const schema = schemaForExample(example.operationId, example.part, status)
    assert(!isArtifactValue(schema, example.value))
  })
}

test('validation does not coerce, trim, strip or default HTTP data', () => {
  for (const value of [
    { name: ' plan', contentType: 'text/markdown' },
    { name: 'plan', contentType: 'Text/Markdown' },
    { name: 'plan', contentType: 'text/markdown; charset=utf-8' },
    { name: 'plan', contentType: 'text/markdown', title: null },
    { name: 'plan', contentType: 'text/markdown', permissions: ['read'] },
  ]) {
    const before = structuredClone(value)
    assert(!isArtifactValue('CreateArtifactRequest', value))
    assert.deepEqual(value, before)
  }
  assert(!isArtifactValue('CompleteArtifactRequest', { state: 'uploaded', sizeBytes: '5', sha256: 'a'.repeat(64) }))
})

test('boundary values and malformed IDs, names, metadata and states', () => {
  for (const name of ['', '../plan', 'plan.md', 'Plan', 'plän', 'a--b', 'a'.repeat(65)]) {
    assert(!isArtifactValue('Name', name))
  }
  for (const id of ['x', '10000000-0000-1000-8000-000000000001', '10000000-0000-4000-0000-000000000001']) {
    assert(!isArtifactValue('Uuid', id))
  }
  for (const sizeBytes of [-1, 0.5, 104857601, null]) {
    assert(!isArtifactValue('CompleteArtifactRequest', { state: 'uploaded', sizeBytes, sha256: 'a'.repeat(64) }))
  }
  for (const sizeBytes of [0, 104857600]) {
    assert(isArtifactValue('CompleteArtifactRequest', { state: 'uploaded', sizeBytes, sha256: 'a'.repeat(64) }))
  }
  for (const state of ['reserved', 'complete', null]) {
    assert(!isArtifactValue('CompleteArtifactRequest', { state, sizeBytes: 5, sha256: 'a'.repeat(64) }))
  }
  const valid = { name: 'plan', contentType: 'text/markdown' }
  for (const extra of [{ title: '' }, { title: 'a\nb' }, { title: 'a'.repeat(161) }, { description: 'a'.repeat(2001) }, { kind: 'a/b' }]) {
    assert(!isArtifactValue('CreateArtifactRequest', { ...valid, ...extra }))
  }
})

test('all generated schemas compile once and validators are reused', () => {
  for (const name of Object.keys(spec.components.schemas) as ArtifactSchemaName[]) {
    assert.equal(artifactValidator(name), artifactValidator(name))
  }
})
