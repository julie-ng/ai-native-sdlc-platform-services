import { z } from 'zod'
import { artifactSchemas } from '../../shared/utils/zod-schemas/index.ts'
import { artifactHttpContract } from '../artifact-openapi.ts'

// A fresh registry and HTTP tree keep callers (including dereferencers) isolated.
export function buildArtifactOpenApi() {
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
  const http = structuredClone(artifactHttpContract)
  return {
    ...http,
    'x-generated-by': 'npm run generate:artifact-openapi; edit shared/utils/zod-schemas/ and scripts/artifact-openapi.ts',
    'components': { ...http.components, schemas },
  }
}
