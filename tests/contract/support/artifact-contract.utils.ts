import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import SwaggerParser from '@apidevtools/swagger-parser'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import exampleData from '../../../docs/api/examples.json' with { type: 'json' }
import fixtureData from '../../../docs/api/caller-contexts.fixture.json' with { type: 'json' }
import { artifactSchemas } from '../../../shared/utils/zod-schemas/index.ts'
import type { ArtifactRef, CallerContext } from '../../../shared/types/artifact.ts'
import type { ArtifactSchemaName } from '../../../shared/utils/zod-schemas/index.ts'

export interface Media {
  schema: { $ref?: string }
  examples: Record<string, { value: unknown }>
}
interface Response {
  content: { 'application/json': Media }
}
export interface Operation {
  operationId: string
  parameters?: { name: string, in: string, required: boolean, schema: { $ref?: string }, example: unknown }[]
  requestBody?: { content: { 'application/json': Media } }
  responses: Record<string, Response | { $ref: string }>
}
export interface Contract {
  components: { schemas: Record<string, object>, responses: Record<string, Response | { $ref: string }> }
  paths: Record<string, Record<string, Operation>>
}
export interface RequestExample {
  id: string
  operationId: string
  context: string
  parameters?: unknown
  body?: unknown
  responseStatus: number
  response: unknown
}
interface ContextExamples {
  testOnly: boolean
  contexts: Record<string, CallerContext>
  workflowRecords: {
    runs: { id: string }[]
    steps: { id: string, runId: string }[]
  }
  artifactRecords: { id: string, reference: ArtifactRef }[]
}

export const examples = exampleData
export const fixtures: ContextExamples = fixtureData

// Narrow only after Swagger Parser validates structure/references. Its generic
// document types cannot express Zod's broader JSON Schema export types.
export async function loadArtifactContract() {
  const json = await readFile(new URL('../../../docs/api/artifact.openapi.json', import.meta.url), 'utf8')
  const validated = await SwaggerParser.validate(JSON.parse(json), { resolve: { external: false } })
  assert('openapi' in validated && validated.openapi === '3.0.3')
  const spec = validated as unknown as Contract
  const source = JSON.parse(json) as Contract
  const operations = new Map(Object.values(source.paths).flatMap(methods => Object.values(methods).map(op => [op.operationId, op] as const)))
  const ajv = new Ajv({ allErrors: true, strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false })
  addFormats(ajv)

  function check(schema: object, value: unknown, label: string, expected = true) {
    const validate = ajv.compile(schema)
    assert.equal(validate(value), expected, `${label}: ${ajv.errorsText(validate.errors)}`)
  }
  function component(name: string, value: unknown, label: string, expected = true) {
    assert(name in artifactSchemas, `Unknown Zod component ${name}`)
    const schema = artifactSchemas[name as ArtifactSchemaName]
    assert.equal(schema.safeParse(value).success, expected, `${label}: Zod ${name}`)
    const exported = spec.components.schemas[name]
    assert(exported, `Unknown OpenAPI component ${name}`)
    check(exported, value, `${label}: OpenAPI ${name}`, expected)
  }
  function media(media: Media, value: unknown, label: string, expected = true) {
    const reference = media.schema.$ref
    assert(reference && reference.startsWith('#/components/schemas/'), label)
    component(reference.split('/').at(-1)!, value, label, expected)
  }
  function responseMedia(response: Response | { $ref: string }): Media {
    if ('$ref' in response) {
      assert(response.$ref.startsWith('#/components/responses/'))
      const shared = source.components.responses[response.$ref.split('/').at(-1)!]
      assert(shared && !('$ref' in shared))
      return shared.content['application/json']
    }
    return response.content['application/json']
  }
  function operation(id: string) {
    const operation = operations.get(id)
    assert(operation, `Unknown operation ${id}`)
    return operation
  }
  function request(example: Omit<RequestExample, 'responseStatus' | 'response'>) {
    const op = operation(example.operationId)
    assert(fixtures.contexts[example.context], `Unknown context ${example.context}`)
    if (op.parameters?.length) {
      component('ArtifactIdParameters', example.parameters ?? {}, `${example.id} parameters`)
    }
    else {
      assert.deepEqual(example.parameters ?? {}, {})
    }
    if (op.requestBody) {
      media(op.requestBody.content['application/json'], example.body, `${example.id} body`)
    }
    else {
      assert(!('body' in example), `${example.id} must not have a body`)
    }
    return op
  }
  return { spec, source, operations, compile: (schema: object) => ajv.compile(schema), check, component, media, responseMedia, operation, request }
}
