// Unknown API paths return JSON 404 instead of falling through to the Nuxt page
// renderer (200 HTML). Known paths with an unsupported method still fall through:
// Nitro matches the path first, so this catch-all does not see them.
export default defineEventHandler(() => {
  throw createError({ statusCode: 404, message: 'Not found' })
})
