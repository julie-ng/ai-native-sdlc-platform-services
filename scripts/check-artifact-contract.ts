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
interface Response {
  content: { 'application/json': Media }
}
interface Operation {
  operationId: string
  parameters?: { name: string, in: string, required: boolean, schema: object, example: unknown }[]
  requestBody?: { content: { 'application/json': Media } }
  responses: Record<string, Response>
}
interface Contract {
  components: { schemas: Record<string, object>, responses: Record<string, Response> }
  paths: Record<string, Record<string, Operation>>
}
interface RequestExample {
  id: string
  operationId: string
  context: string
  parameters?: unknown
  body?: unknown
  responseStatus: number
  response: unknown
}
interface ArtifactRef {
  runId: string
  producerStepId: string
  name: string
}
interface CallerContext {
  runId: string
  stepId: string
  inputs: ArtifactRef[]
  outputs: ArtifactRef[]
}
interface Examples {
  requests: RequestExample[]
  sasExamples: { id: string, schema: string, value: { url: string, method: string, headers: Record<string, string> } }[]
  negativeExamples: {
    id: string
    operationId: string
    part: 'body' | 'parameters' | 'response'
    responseStatus?: number
    value: unknown
  }[]
  accessCases: (Omit<RequestExample, 'responseStatus' | 'response'> & {
    expectedStatus: number
    response: unknown
    preconditions: { artifactExists: boolean, hasAnyAccess: boolean, actionAllowed: boolean }
  })[]
  invalidContexts: { id: string, value: unknown }[]
  policyCases: { id: string, context: string, reference: unknown, action: string, expected: boolean }[]
}
interface ContextExamples {
  testOnly: boolean
  contexts: Record<string, CallerContext>
  workflowIdentities: {
    runs: { id: string }[]
    steps: { id: string, runId: string }[]
  }
  artifactIdentities: { id: string, reference: ArtifactRef }[]
}

const base = new URL('../docs/api/', import.meta.url)
const validated = await SwaggerParser.validate(fileURLToPath(new URL('artifact.openapi.json', base)), {
  resolve: { external: false },
})
assert('openapi' in validated && validated.openapi === '3.0.3', 'Expected OpenAPI 3.0.3')
// Swagger Parser validates and dereferences the document before this narrowing to
// our supported HTTP/media subset. These script types do not validate HTTP input.
const spec = validated as unknown as Contract
const ajv = new Ajv({ allErrors: true, strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false })
addFormats(ajv)
for (const schema of Object.values(spec.components.schemas)) {
  ajv.compile(schema)
}
let count = 0
function check(schema: object, value: unknown, label: string, expected = true) {
  const validate = ajv.compile(schema)
  assert.equal(validate(value), expected, `${label}: ${ajv.errorsText(validate.errors)}`)
  count++
}
function parametersSchema(operation: Operation) {
  return {
    type: 'object',
    additionalProperties: false,
    required: (operation.parameters ?? []).filter(parameter => parameter.required).map(parameter => parameter.name),
    properties: Object.fromEntries((operation.parameters ?? []).map(parameter => [parameter.name, parameter.schema])),
  }
}
const operations = new Map<string, Operation>()
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    assert(['get', 'post', 'put'].includes(method), `Unexpected method ${method}`)
    assert(!operations.has(operation.operationId), 'Operation IDs must be unique')
    operations.set(operation.operationId, operation)
    for (const parameter of operation.parameters ?? []) {
      assert.equal(parameter.in, 'path')
      assert(path.includes(`{${parameter.name}}`), 'Parameter must appear in path')
      check(parameter.schema, parameter.example, `${operation.operationId} ${parameter.name}`)
    }
    if (operation.requestBody) {
      const request = operation.requestBody.content['application/json']
      assert(Object.keys(request.examples).length > 0, 'Missing body examples')
      for (const [name, example] of Object.entries(request.examples)) {
        check(request.schema, example.value, `${operation.operationId} request ${name}`)
      }
    }
    for (const [status, response] of Object.entries(operation.responses)) {
      const media = response.content['application/json']
      assert(Object.keys(media.examples).length > 0, `Missing ${status} response example`)
      for (const [name, example] of Object.entries(media.examples)) {
        check(media.schema, example.value, `${operation.operationId} ${status} ${name}`)
      }
    }
  }
}
for (const [name, response] of Object.entries(spec.components.responses)) {
  const media = response.content['application/json']
  for (const [exampleName, example] of Object.entries(media.examples)) {
    check(media.schema, example.value, `${name} ${exampleName}`)
  }
}
assert.equal(operations.size, 5)
const examples: Examples = JSON.parse(await readFile(new URL('examples.json', base), 'utf8'))
const fixtures: ContextExamples = JSON.parse(await readFile(new URL('caller-contexts.fixture.json', base), 'utf8'))
assert.equal(fixtures.testOnly, true)
const runs = new Set(fixtures.workflowIdentities.runs.map(run => run.id))
const steps = new Map(fixtures.workflowIdentities.steps.map(step => [step.id, step]))
assert.equal(runs.size, fixtures.workflowIdentities.runs.length, 'Duplicate run identity')
assert.equal(steps.size, fixtures.workflowIdentities.steps.length, 'Duplicate step identity')
for (const run of fixtures.workflowIdentities.runs) {
  check(spec.components.schemas.Uuid, run.id, 'workflow run ID')
}
for (const step of steps.values()) {
  check(spec.components.schemas.Uuid, step.id, 'workflow step ID')
  assert(runs.has(step.runId), 'Unknown run in seed data')
}
function checkReference(reference: ArtifactRef) {
  check(spec.components.schemas.ArtifactRef, reference, 'trusted reference')
  assert.equal(steps.get(reference.producerStepId)?.runId, reference.runId)
}
for (const [name, context] of Object.entries(fixtures.contexts)) {
  check(spec.components.schemas.CallerContext, context, name)
  assert.equal(steps.get(context.stepId)?.runId, context.runId)
  for (const reference of [...context.inputs, ...context.outputs]) {
    checkReference(reference)
    assert.equal(reference.runId, context.runId)
  }
  for (const reference of context.outputs) {
    assert.equal(reference.producerStepId, context.stepId)
  }
}
const artifactIds = new Set<string>()
const artifactKeys = new Set<string>()
for (const artifact of fixtures.artifactIdentities) {
  const key = `${artifact.reference.producerStepId}:${artifact.reference.name}`
  assert(!artifactIds.has(artifact.id), 'Duplicate artifact ID')
  assert(!artifactKeys.has(key), 'More than one artifact for the same step/name')
  artifactIds.add(artifact.id)
  artifactKeys.add(key)
  check(spec.components.schemas.Uuid, artifact.id, 'seed artifact ID')
  checkReference(artifact.reference)
}
function checkRequest(example: Omit<RequestExample, 'responseStatus' | 'response'>) {
  const operation = operations.get(example.operationId)
  assert(operation, example.id)
  assert(fixtures.contexts[example.context], `Unknown context ${example.context}`)
  check(parametersSchema(operation), example.parameters ?? {}, `${example.id} parameters`)
  if (operation.requestBody) {
    check(operation.requestBody.content['application/json'].schema, example.body, `${example.id} body`)
  }
  else {
    assert(!('body' in example), `${example.id} must not have a body`)
  }
  return operation
}
const coverage = new Set<string>()
for (const example of examples.requests) {
  const operation = checkRequest(example)
  const response = operation.responses[String(example.responseStatus)]
  assert(response, `Undocumented status in ${example.id}`)
  check(response.content['application/json'].schema, example.response, `${example.id} response`)
  coverage.add(`${example.operationId}:${example.responseStatus}`)
}
for (const operation of operations.values()) {
  for (const status of Object.keys(operation.responses).filter(status => status.startsWith('2'))) {
    assert(coverage.has(`${operation.operationId}:${status}`), `Missing success example ${operation.operationId}:${status}`)
  }
}
assert(examples.negativeExamples.length > 0, 'Negative examples are required')
for (const example of examples.negativeExamples) {
  const operation = operations.get(example.operationId)
  assert(operation, example.id)
  const schema = example.part === 'parameters'
    ? parametersSchema(operation)
    : example.part === 'body'
      ? operation.requestBody?.content['application/json'].schema
      : operation.responses[String(example.responseStatus)]?.content['application/json'].schema
  assert(schema, `Unknown example target ${example.id}`)
  check(schema, example.value, example.id, false)
}
assert(examples.accessCases.length > 0, 'Access cases are required')
for (const example of examples.accessCases) {
  const operation = checkRequest(example)
  const response = operation.responses[String(example.expectedStatus)]
  assert(response, `Undocumented access outcome ${example.id}`)
  check(response.content['application/json'].schema, example.response, `${example.id} error`)
  const conditions = example.preconditions
  for (const condition of Object.values(conditions)) {
    assert.equal(typeof condition, 'boolean')
  }
  const expected = !conditions.artifactExists || !conditions.hasAnyAccess
    ? 404
    : conditions.actionAllowed ? 200 : 403
  assert.equal(example.expectedStatus, expected, `Visibility/permission classification: ${example.id}`)
}
for (const example of examples.invalidContexts) {
  check(spec.components.schemas.CallerContext, example.value, example.id, false)
}
for (const example of examples.policyCases) {
  assert(fixtures.contexts[example.context], example.id)
  assert(['create', 'read', 'update'].includes(example.action))
  assert.equal(typeof example.expected, 'boolean')
  check(spec.components.schemas.ArtifactRef, example.reference, example.id)
}
for (const example of examples.sasExamples) {
  assert(['WritableUploadSas', 'CreateOnlyUploadSas'].includes(example.schema))
  check(spec.components.schemas[example.schema], example.value, example.id)
  const url = new URL(example.value.url)
  const createOnly = example.schema === 'CreateOnlyUploadSas'
  assert.equal(url.searchParams.get('sp'), createOnly ? 'c' : 'w')
  assert.equal(url.searchParams.get('sr'), 'b')
  assert.equal(url.searchParams.get('spr'), 'https')
  assert(!url.pathname.includes('/attempts/'), 'Blob key must be step-owned')
}
const first = examples.requests.find(example => example.id === 'planner-registers-local-plan')
assert(first && first.response && typeof first.response === 'object' && 'id' in first.response)
for (const name of ['planner-requests-fresh-sas-after-upload', 'later-execution-reuses-step-artifact']) {
  const example = examples.requests.find(example => example.id === name)
  assert(example && example.response && typeof example.response === 'object' && 'id' in example.response)
  assert.equal(example.response.id, first.response.id, 'Repeat writes must retain artifact ID')
}
for (const example of examples.requests.filter(example => example.operationId === 'createArtifact')) {
  // These shapes were schema-validated above; check cross-example relationships.
  const body = example.body as { name: string }
  const response = example.response as { id: string, upload: { url: string, headers: Record<string, string> } }
  const caller = fixtures.contexts[example.context]
  const reference = caller.outputs.find(output => output.name === body.name)
  assert(reference, 'Registration must use a trusted own-output binding')
  const seed = fixtures.artifactIdentities.find(artifact => artifact.id === response.id)
  assert.deepEqual(seed?.reference, reference, 'Registration ID must match its step-owned artifact')
  const url = new URL(response.upload.url)
  const expectedPath = `/artifacts/v1/runs/${reference.runId}/steps/${reference.producerStepId}/artifacts/${reference.name}`
  assert.equal(url.pathname, expectedPath, 'Uploads and renewals must use the same step-owned key')
  assert.equal(url.searchParams.get('sp'), response.upload.headers['If-None-Match'] === '*' ? 'c' : 'w')
}
const revised = examples.requests.find(example => example.id === 'planner-reports-revised-plan')
const latest = examples.requests.find(example => example.id === 'coder-reads-latest-plan-metadata')
assert(revised && latest)
const completion = revised.body as { sizeBytes: number, sha256: string }
const metadata = latest.response as { sizeBytes: number, sha256: string }
assert.equal(metadata.sizeBytes, completion.sizeBytes, 'Latest metadata must reflect the last report')
assert.equal(metadata.sha256, completion.sha256, 'Latest metadata must reflect the last report')
function checkTimestamps(value: unknown) {
  if (!value || typeof value !== 'object') {
    return
  }
  const record = value as Record<string, unknown>
  if ('createdAt' in record) {
    assert.equal(typeof record.updatedAt, 'string', 'Metadata needs updatedAt')
    assert(Date.parse(String(record.updatedAt)) >= Date.parse(String(record.createdAt)), 'updatedAt precedes creation')
    if (record.state === 'reserved') {
      assert.equal(record.updatedAt, record.createdAt, 'Registration starts both timestamps together')
    }
    if (record.state === 'uploaded') {
      assert.equal(record.updatedAt, record.uploadedAt, 'Completion updates both timestamps with one DB instant')
    }
  }
  for (const child of Object.values(record)) {
    checkTimestamps(child)
  }
}
for (const example of examples.requests) {
  checkTimestamps(example.response)
}
for (const operation of operations.values()) {
  for (const response of Object.values(operation.responses)) {
    for (const example of Object.values(response.content['application/json'].examples)) {
      checkTimestamps(example.value)
    }
  }
}
// Generated constants provide schema-derived design types. Verify freshness so
// contract edits cannot silently leave the adapter types stale.
const generated = `/* eslint-disable */\n// Mechanical schema output; TypeScript and Ajv validate it.\n// Generated by npm run generate:artifact-schemas. Do not edit.\nexport const schemas = ${JSON.stringify(spec.components.schemas, null, 2)} as const\n`
const generatedPath = new URL('../../shared/utils/artifact-schemas/schemas.ts', base)
if (process.argv.includes('--write')) {
  await writeFile(generatedPath, generated)
}
else {
  assert((await readFile(generatedPath, 'utf8')) === generated, 'Generated schemas are stale; run npm run generate:artifact-schemas')
}
console.log(`Validated OpenAPI, ${Object.keys(spec.components.schemas).length} schemas and ${count} examples/seed checks. Authorization execution and Azure/DB integrations are not tested.`)
