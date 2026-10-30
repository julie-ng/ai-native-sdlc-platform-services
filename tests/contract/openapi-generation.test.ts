import { readFile } from 'node:fs/promises'
import { assert, expect, test } from 'vitest'
import SwaggerParser from '@apidevtools/swagger-parser'
import { artifactSchemas } from '../../shared/utils/zod-schemas/index.ts'
import type { ArtifactSchemaName } from '../../shared/utils/zod-schemas/index.ts'
import { buildArtifactOpenApi } from '../../scripts/openapi/artifact-openapi.utils.ts'

// Compare serialized bytes so a hand edit cannot bypass regeneration.
test('committed OpenAPI matches freshly generated output', async () => {
  const committed = await readFile(new URL('../../docs/api/artifact.openapi.json', import.meta.url), 'utf8')
  expect(committed, 'Run npm run generate:artifact-openapi').toBe(`${JSON.stringify(buildArtifactOpenApi(), null, 2)}\n`)
})

test('OpenAPI generation is deterministic and does not retain caller mutations', async () => {
  const expected = buildArtifactOpenApi()
  const mutable = buildArtifactOpenApi()
  Object.assign(mutable.info, { title: 'Changed by a consumer' })
  delete mutable.components.schemas.Uuid
  expect(buildArtifactOpenApi()).toStrictEqual(expected)
  // Swagger Parser dereferences in place; it must not affect later builds.
  await SwaggerParser.validate(JSON.parse(JSON.stringify(buildArtifactOpenApi())), { resolve: { external: false } })
  expect(buildArtifactOpenApi()).toStrictEqual(expected)
})

test('generated OpenAPI structure and internal references validate without network access', async () => {
  const document = await SwaggerParser.validate(JSON.parse(JSON.stringify(buildArtifactOpenApi())), { resolve: { external: false } })
  assert('openapi' in document)
  expect(document.openapi).toBe('3.0.3')
})

test('schema registry and exported component names agree', () => {
  expect(Object.keys(buildArtifactOpenApi().components.schemas).sort()).toStrictEqual(Object.keys(artifactSchemas).sort())
})

test('every documentation example satisfies its Zod schema', () => {
  interface Media { schema: { $ref: string }, example?: unknown }
  interface Operation { requestBody?: { content: Record<string, Media> }, responses: Record<string, { content: Record<string, Media> }> }
  const paths = buildArtifactOpenApi().paths as unknown as Record<string, Record<string, Operation>>
  const media = Object.values(paths).flatMap(methods => Object.values(methods)).flatMap(operation => [
    ...(operation.requestBody ? [operation.requestBody.content['application/json']!] : []),
    ...Object.values(operation.responses).map(response => response.content['application/json']!),
  ])
  const examples = media.filter(entry => 'example' in entry)
  expect(examples.length).toBe(8)
  for (const entry of examples) {
    const name = entry.schema.$ref.split('/').at(-1) as ArtifactSchemaName
    expect(artifactSchemas[name].safeParse(entry.example).success, name).toBe(true)
  }
})
