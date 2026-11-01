// starlight-openapi has no component override API: its route imports its own components with
// relative paths. This Vite plugin redirects selected imports to local Tailwind versions and leaves
// every other component untouched.
// IMPORTANT: Relies on the plugin's internal file names and props, which are not a public interface.
// starlight-openapi is pinned to an exact version; recheck the overridden files when upgrading.
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const componentsDir = path.join(path.dirname(require.resolve('starlight-openapi/package.json')), 'components')
const overridesDir = fileURLToPath(new URL('./components/openapi/', import.meta.url))

/**
 * @param {string[]} files Paths relative to starlight-openapi's `components/` directory, mirrored
 *   under `src/components/openapi/`.
 * @returns {import('vite').Plugin}
 */
export function openAPIComponentOverrides(files) {
  const overrides = new Map(files.map(file => [path.join(componentsDir, file), path.join(overridesDir, file)]))
  return {
    name: 'starlight-openapi-component-overrides',
    enforce: 'pre',
    resolveId(source, importer) {
      // Only plain relative imports from inside the plugin; Astro's `?astro&type=style` sub-requests
      // then resolve against the local file.
      if (!importer?.startsWith(componentsDir) || !source.startsWith('.') || source.includes('?')) {
        return null
      }
      return overrides.get(path.resolve(path.dirname(importer.split('?')[0]), source)) ?? null
    },
  }
}
