import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { artifactSchemas } from '../shared/utils/zod-schemas/index.ts'
import { artifactHttpContract } from './artifact-openapi.ts'

const registry = z.registry<{ id: string }>()
for (const [id, schema] of Object.entries(artifactSchemas)) {
  registry.add(schema, { id })
}
const { schemas } = z.toJSONSchema(registry, {
  target: 'openapi-3.0',
  uri: id => `#/components/schemas/${id}`,
})
// Registry IDs become component references. OpenAPI 3.0 does not permit the
// standalone JSON Schema $id keyword on those component definitions.
for (const schema of Object.values(schemas)) {
  delete schema.$id
}
const document = {
  ...artifactHttpContract,
  'x-generated-by': 'npm run generate:artifact-openapi; edit shared/utils/zod-schemas/ and scripts/artifact-openapi.ts',
  'components': { ...artifactHttpContract.components, schemas },
}
const generated = `${JSON.stringify(document, null, 2)}\n`
const output = new URL('../docs/api/artifact.openapi.json', import.meta.url)
if (process.argv.includes('--write')) {
  await writeFile(output, generated)
}
else {
  assert((await readFile(output, 'utf8')) === generated, 'Generated OpenAPI is stale; run npm run generate:artifact-openapi')
}
console.log(`Checked generated OpenAPI from ${Object.keys(artifactSchemas).length} Zod schemas and TypeScript HTTP definitions.`)
