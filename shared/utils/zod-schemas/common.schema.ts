import { z } from 'zod'

// Logical IDs are canonical lowercase UUID v4, including the RFC variant bits.
export const uuidSchema = z.string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  .meta({ format: 'uuid' })

// Artifact slots are slugs, never filenames or physical storage paths.
export const nameSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
export const utcInstantSchema = z.iso.datetime()
export const contentTypeSchema = z.string().min(3).max(127)
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/)
export const sizeBytesSchema = z.number().int().min(0).max(104857600)
export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
export const titleSchema = z.string().min(1).max(160).regex(/^[^\r\n]+$/)
export const descriptionSchema = z.string().min(1).max(2000)
