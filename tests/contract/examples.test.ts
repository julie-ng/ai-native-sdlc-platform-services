import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { examples, loadArtifactContract } from './support/artifact-contract.utils.ts'

let contract: Awaited<ReturnType<typeof loadArtifactContract>>
before(async () => {
  contract = await loadArtifactContract()
})

test('operation IDs, parameters, schemas and documented success outcomes are complete', () => {
  const ids = new Set<string>()
  for (const [path, methods] of Object.entries(contract.source.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      assert(['get', 'post', 'put'].includes(method), method)
      assert(!ids.has(operation.operationId), 'Duplicate operation ID')
      ids.add(operation.operationId)
      for (const parameter of operation.parameters ?? []) {
        assert.equal(parameter.in, 'path')
        assert(path.includes(`{${parameter.name}}`))
        assert(parameter.schema.$ref)
        contract.component(parameter.schema.$ref.split('/').at(-1)!, parameter.example, `${operation.operationId} parameter`)
      }
      for (const status of Object.keys(operation.responses).filter(status => status.startsWith('2'))) {
        assert(examples.requests.some(example => example.operationId === operation.operationId && String(example.responseStatus) === status), `${operation.operationId}:${status}`)
      }
    }
  }
  assert.equal(ids.size, 5)
  for (const schema of Object.values(contract.spec.components.schemas)) {
    // Compile even components not reached by an example.
    contract.compile(schema)
  }
})

// These execute both validators on the same authored values. They do not make
// HTTP requests or prove any service, database or Azure behavior.
for (const example of examples.requests) {
  test(`Zod and exported OpenAPI accept request/response: ${example.id}`, () => {
    const operation = contract.request(example)
    const response = operation.responses[String(example.responseStatus)]
    assert(response, `Undocumented status ${example.responseStatus}`)
    contract.media(contract.responseMedia(response), example.response, example.id)
  })
}
for (const example of examples.negativeExamples) {
  test(`Zod and exported OpenAPI reject: ${example.id}`, () => {
    const operation = contract.operation(example.operationId)
    if (example.part === 'parameters') {
      contract.component('ArtifactIdParameters', example.value, example.id, false)
    }
    else if (example.part === 'body') {
      assert(operation.requestBody)
      contract.media(operation.requestBody.content['application/json'], example.value, example.id, false)
    }
    else {
      assert.equal(example.part, 'response')
      const response = operation.responses[String(example.responseStatus)]
      assert(response)
      contract.media(contract.responseMedia(response), example.value, example.id, false)
    }
  })
}

test('all HTTP documentation examples agree with runtime and exported schemas', () => {
  for (const operation of contract.operations.values()) {
    const media = [
      ...(operation.requestBody ? [operation.requestBody.content['application/json']] : []),
      ...Object.values(operation.responses).map(contract.responseMedia),
    ]
    for (const entry of media) {
      assert(Object.keys(entry.examples).length > 0)
      for (const example of Object.values(entry.examples)) {
        contract.media(entry, example.value, operation.operationId)
      }
    }
  }
  for (const response of Object.values(contract.source.components.responses)) {
    const media = contract.responseMedia(response)
    for (const example of Object.values(media.examples)) {
      contract.media(media, example.value, 'shared response')
    }
  }
})
