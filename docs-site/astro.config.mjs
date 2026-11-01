// Documentation site for Platform Services, published to GitHub Pages.
// `site` and `base` match the project Pages URL: https://julie-ng.github.io/ai-native-sdlc-platform-services/
import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi'
import starlightTypeDoc from 'starlight-typedoc'

export default defineConfig({
  site: 'https://julie-ng.github.io',
  base: '/ai-native-sdlc-platform-services',
  // Port 3000 is the Nuxt app; the docs preview runs alongside it.
  server: { port: 4000 },
  integrations: [
    starlight({
      title: 'Platform Services',
      // Tailwind base and design tokens first, as Starlight's Tailwind guide requires.
      customCss: ['./src/styles/global.css'],
      // Flat sidebar: src/route-data.ts reshapes the generated entries.
      routeMiddleware: './src/route-data.ts',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/julie-ng/ai-native-sdlc-platform-services' },
      ],
      plugins: [
        // Entry points, tsconfig and validation come from typedoc.json, which `npm run check`
        // also uses, so the site and the documentation check cannot drift apart.
        starlightTypeDoc({
          output: 'code',
          // Regenerate on source changes during `astro dev` only; builds run once.
          watch: process.argv.includes('dev'),
          // Module overview pages are only generated with an explicit entry file name.
          // The module router puts each module and its members on one page.
          typeDoc: { entryFileName: 'index.md', router: 'module' },
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
        // starlight-typedoc's own sidebar group expects one page per member, so list the
        // generated module pages instead; src/route-data.ts groups them by folder.
        { label: 'Code reference', items: [{ autogenerate: { directory: 'code' } }] },
      ],
    }),
  ],
  vite: { plugins: [tailwindcss()] },
})
