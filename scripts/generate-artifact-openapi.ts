import { writeFile } from 'node:fs/promises'
import { buildArtifactOpenApi } from './openapi/artifact-openapi.utils.ts'

const output = new URL('../docs/api/artifact.openapi.json', import.meta.url)
await writeFile(output, `${JSON.stringify(buildArtifactOpenApi(), null, 2)}\n`)
console.log('Generated artifact OpenAPI from Zod schemas and TypeScript HTTP definitions.')
