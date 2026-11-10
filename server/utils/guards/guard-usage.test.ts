import { readdir, readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const apiDirectory = new URL('../../api/', import.meta.url)
const unguardedRoutes = [
  // Unknown API paths only throw JSON 404; no input, resources or protected data.
  '[...path].ts',
]

// Deliberately regex-based: commented-out code can fool these checks. This checks
// visible guard placement, not runtime control flow or authentication behavior.
const inputCall = /\b(?:readArtifactBody|readArtifactId|readBody|readValidatedBody|getQuery|getValidatedQuery|getRouter\w*)\s*\(/

const files = await readdir(apiDirectory, { recursive: true, withFileTypes: true })
const routes = files.filter(file => file.isFile()).map(file =>
  relative(fileURLToPath(apiDirectory), `${file.parentPath}/${file.name}`),
)

for (const route of routes) {
  test(`API route ${route} has its required guard before input reads`, async () => {
    const source = await readFile(new URL(route, apiDirectory), 'utf8')
    if (unguardedRoutes.includes(route)) {
      return
    }

    const guard = route.startsWith('artifacts/')
      ? /\bawait\s+requireStepContext\s*\(\s*event\s*\)/
      : route.startsWith('runs/')
        ? /\brequireAdminToken\s*\(\s*event\s*\)/
        : undefined
    expect(guard, `${route}: classify the route with a required guard or a justified allow-list entry`).toBeDefined()
    const guardIndex = source.search(guard!)
    expect(guardIndex, `${route}: missing required guard call`).toBeGreaterThanOrEqual(0)
    const inputIndex = source.search(inputCall)
    if (inputIndex !== -1) {
      expect(guardIndex, `${route}: authenticate before reading input`).toBeLessThan(inputIndex)
    }
  })
}

test('unguarded route allow-list contains only existing routes', () => {
  for (const route of unguardedRoutes) {
    expect(routes).toContain(route)
  }
})
