import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import SwaggerParser from '@apidevtools/swagger-parser'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

interface Media {
  schema: object
  examples: Record<string, { value: unknown }>
}
interface Operation {
  operationId: string
  requestBody: { content: { 'application/json': Media } }
  responses: Record<string, { content: { 'application/json': Media } }>
}
interface Contract {
  components: { schemas: Record<string, object>, responses: Record<string, { content: { 'application/json': Media } }> }
  paths: Record<string, { post: Operation }>
}
interface Fixture {
  handoff: {
    id: string
    operationId: string
    request: unknown
    responseStatus: number
    response: unknown
    caller: string
  }[]
  schemaCases: {
    id: string
    operationId: string
    schema: string
    valid: boolean
    value: unknown
  }[]
  policyDenials: {
    id: string
    caller: string
    operationId: string
    reference: unknown
    expectedStatus: number
  }[]
}

const base = new URL('../docs/api/', import.meta.url)
// Validate structure and dereference only repository-local references. Network and
// external files are disabled: a fresh checkout is the entire contract input.
const validated = await SwaggerParser.validate(fileURLToPath(new URL('artifact.openapi.json', base)), {
  resolve: { external: false },
})
assert('openapi' in validated && validated.openapi === '3.0.3', 'Expected OpenAPI 3.0.3')
// Swagger Parser has validated these structures. This type only narrows to this
// contract's supported media/method subset; it does not validate HTTP input.
const spec = validated as unknown as Contract
const ajv = new Ajv({ allErrors: true, strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false })
addFormats(ajv)
const validators = Object.fromEntries(Object.entries(spec.components.schemas).map(([name, schema]) => [name, ajv.compile(schema)]))
let count = 0
function check(schema: object, value: unknown, label: string, expected = true) {
  const validate = ajv.compile(schema)
  assert.equal(validate(value), expected, `${label}: ${ajv.errorsText(validate.errors)}`)
  count++
}
const operations = new Map<string, Operation>()
for (const path of Object.values(spec.paths)) {
  assert.deepEqual(Object.keys(path), ['post'], 'Only the three selected POST operations are contracted')
  const operation = path.post
  assert(!operations.has(operation.operationId), 'Operation IDs must be unique')
  operations.set(operation.operationId, operation)
  const request = operation.requestBody.content['application/json']
  assert(Object.keys(request.examples).length > 0, 'Missing request examples')
  for (const [name, example] of Object.entries(request.examples)) {
    check(request.schema, example.value, `${operation.operationId} request ${name}`)
  }
  for (const [status, response] of Object.entries(operation.responses)) {
    const media = response.content['application/json']
    assert(Object.keys(media.examples).length > 0, `Missing ${status} response example`)
    for (const [name, example] of Object.entries(media.examples)) {
      check(media.schema, example.value, `${operation.operationId} ${status} ${name}`)
    }
  }
}
for (const [name, response] of Object.entries(spec.components.responses)) {
  const media = response.content['application/json']
  for (const [exampleName, example] of Object.entries(media.examples)) {
    check(media.schema, example.value, `${name} ${exampleName}`)
  }
}
assert.equal(operations.size, 3)
const fixtures: Fixture = JSON.parse(await readFile(new URL('examples.json', base), 'utf8'))
const identities: { testOnly: boolean, assignments: Record<string, unknown> } = JSON.parse(await readFile(new URL('assignments.fixture.json', base), 'utf8'))
assert.equal(identities.testOnly, true)
for (const [token, assignment] of Object.entries(identities.assignments)) {
  assert(token.startsWith('fixture-'), 'Fixtures must use visibly test-only tokens')
  check(spec.components.schemas.Assignment, assignment, token)
}
const coverage = new Set<string>()
for (const example of fixtures.handoff) {
  const operation = operations.get(example.operationId)
  assert(operation, example.id)
  assert(identities.assignments[example.caller], `Unknown fixture caller ${example.caller}`)
  check(operation.requestBody.content['application/json'].schema, example.request, `${example.id} request`)
  const response = operation.responses[String(example.responseStatus)]
  assert(response, `Undocumented status in ${example.id}`)
  check(response.content['application/json'].schema, example.response, `${example.id} response`)
  coverage.add(`${example.operationId}:${example.responseStatus}`)
}
for (const operation of operations.values()) {
  for (const status of Object.keys(operation.responses).filter(status => status.startsWith('2'))) {
    assert(coverage.has(`${operation.operationId}:${status}`), `Missing handoff example ${operation.operationId}:${status}`)
  }
}
assert(fixtures.schemaCases.length > 0, 'Negative schema examples are required')
for (const example of fixtures.schemaCases) {
  assert(operations.has(example.operationId), example.id)
  assert.equal(example.valid, false, 'schemaCases are negative examples')
  const schema = spec.components.schemas[example.schema]
  assert(schema && validators[example.schema], `Unknown schema ${example.schema}`)
  check(schema, example.value, example.id, false)
}
assert(fixtures.policyDenials.length > 0, 'Policy denial matrix is required')
for (const example of fixtures.policyDenials) {
  assert(operations.has(example.operationId), example.id)
  assert(identities.assignments[example.caller], example.id)
  assert.equal(example.expectedStatus, 403)
  check(spec.components.schemas.ArtifactRef, example.reference, example.id)
}
// Generated constants are type-only design input. Compare deterministically so
// OpenAPI edits cannot silently leave the adapter types stale.
const generated = `/* eslint-disable */\n// Mechanical schema output; TypeScript and Ajv validate it.\n// Generated by npm run generate:artifact-schemas. Do not edit.\nexport const schemas = ${JSON.stringify(spec.components.schemas, null, 2)} as const\n`
const generatedPath = new URL('artifact-schemas.ts', base)
if (process.argv.includes('--write')) {
  await writeFile(generatedPath, generated)
}
else {
  assert((await readFile(generatedPath, 'utf8')) === generated, 'Generated schemas are stale; run npm run generate:artifact-schemas')
}
console.log(`Validated OpenAPI, ${Object.keys(validators).length} schemas and ${count} examples/fixture shapes. Policy execution and Azure/DB integrations are not tested.`)
