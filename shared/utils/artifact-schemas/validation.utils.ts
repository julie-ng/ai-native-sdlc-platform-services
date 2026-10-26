import { Ajv } from 'ajv'
import type { ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'
import type { ArtifactRef, CallerContext, CreateArtifactRequest, CompleteArtifactRequest } from '../../types/artifact.ts'
import { schemas } from './schemas.ts'

// Explicit relative TS imports let the same pure modules run in Node's native
// test runner and Nuxt, without a second alias loader or schema implementation.
const ajv = new Ajv({
  allErrors: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
})
addFormats(ajv)

export type ArtifactSchemaName = keyof typeof schemas
interface GuardedSchemas {
  ArtifactRef: ArtifactRef
  CallerContext: CallerContext
  CreateArtifactRequest: CreateArtifactRequest
  CompleteArtifactRequest: CompleteArtifactRequest
}
const validators = new Map<ArtifactSchemaName, ValidateFunction>()

export function artifactValidator(name: ArtifactSchemaName): ValidateFunction {
  let validate = validators.get(name)
  if (!validate) {
    validate = ajv.compile(schemas[name])
    validators.set(name, validate)
  }
  return validate
}

export function isArtifactValue<N extends keyof GuardedSchemas>(name: N, value: unknown): value is GuardedSchemas[N]
export function isArtifactValue(name: ArtifactSchemaName, value: unknown): boolean
export function isArtifactValue(name: ArtifactSchemaName, value: unknown): boolean {
  return artifactValidator(name)(value)
}
