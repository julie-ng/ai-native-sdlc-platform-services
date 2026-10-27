import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import SwaggerParser from '@apidevtools/swagger-parser'
import { buildArtifactOpenApi } from '../../scripts/openapi/artifact-openapi.utils.ts'

// Compare serialized bytes so a hand edit cannot bypass regeneration.
test('committed OpenAPI matches freshly generated output', async () => {
  const committed = await readFile(new URL('../../docs/api/artifact.openapi.json', import.meta.url), 'utf8')
  assert.equal(committed, `${JSON.stringify(buildArtifactOpenApi(), null, 2)}\n`, 'Run npm run generate:artifact-openapi')
})

test('OpenAPI generation is deterministic and does not retain caller mutations', async () => {
  const expected = buildArtifactOpenApi()
  const mutable = buildArtifactOpenApi()
  Object.assign(mutable.info, { title: 'Changed by a consumer' })
  delete mutable.components.schemas.Uuid
  assert.deepEqual(buildArtifactOpenApi(), expected)
  // Swagger Parser dereferences in place; it must not affect later builds.
  await SwaggerParser.validate(JSON.parse(JSON.stringify(buildArtifactOpenApi())), { resolve: { external: false } })
  assert.deepEqual(buildArtifactOpenApi(), expected)
})

test('generated OpenAPI structure and internal references validate without network access', async () => {
  const document = await SwaggerParser.validate(JSON.parse(JSON.stringify(buildArtifactOpenApi())), { resolve: { external: false } })
  assert('openapi' in document)
  assert.equal(document.openapi, '3.0.3')
})
