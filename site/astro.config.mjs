// Documentation site for Platform Services, published to GitHub Pages.
// `site` and `base` match the project Pages URL: https://julie-ng.github.io/ai-native-sdlc-platform-services/
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'

export default defineConfig({
  site: 'https://julie-ng.github.io',
  base: '/ai-native-sdlc-platform-services',
  // Port 3000 is the Nuxt app; the docs preview runs alongside it.
  server: { port: 4000 },
  integrations: [
    starlight({
      title: 'Platform Services',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/julie-ng/ai-native-sdlc-platform-services' },
      ],
      plugins: [
        // Entry points, tsconfig and validation come from typedoc.json, which `npm run check`
        // also uses, so the site and the documentation check cannot drift apart.
        starlightTypeDoc({
          output: 'code',
          sidebar: { label: 'Code reference', collapsed: false },
          // Regenerate on source changes during `astro dev` only; builds run once.
          watch: process.argv.includes('dev'),
        }),
        // Generated from Zod by `npm run generate:artifact-openapi`; `test:contract` keeps it fresh.
        starlightOpenAPI([
          {
            base: 'http-api',
            schema: '../docs/api/artifact.openapi.json',
            sidebar: { label: 'HTTP API', collapsed: false, operations: { badges: true } },
          },
        ]),
      ],
      sidebar: [
        ...openAPISidebarGroups,
        typeDocSidebarGroup,
      ],
    }),
  ],
})
