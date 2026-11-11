// Documentation site for Platform Services, published to GitHub Pages.
// `site` and `base` match the project Pages URL: https://julie-ng.github.io/ai-native-sdlc-platform-services/
import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi'
import starlightTypeDoc from 'starlight-typedoc'
import { openAPIComponentOverrides } from './src/openapi-overrides.mjs'

export default defineConfig({
  site: 'https://julie-ng.github.io',
  base: '/ai-native-sdlc-platform-services',
  // Port 3000 is the Nuxt app; the docs preview runs alongside it.
  server: { port: 4000 },
  integrations: [
    starlight({
      title: 'Platform Services',
      // Tailwind base and design tokens first, as Starlight's Tailwind guide requires.
      customCss: ['./src/styles/global.css', './src/styles/openapi.css'],
      // Flat sidebar: src/route-data.ts reshapes the entries, src/components/Sidebar.astro renders them.
      routeMiddleware: './src/route-data.ts',
      components: { Sidebar: './src/components/Sidebar.astro' },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/julie-ng/ai-native-sdlc-platform-services',
        },
      ],
      plugins: [
        // Entry points, tsconfig and validation come from typedoc.json, which `npm run check`
        // also uses, so the site and the documentation check cannot drift apart.
        starlightTypeDoc({
          output: 'code',
          // Regenerate on source changes during `astro dev` only; builds run once.
          watch: process.argv.includes('dev'),
          typeDoc: {
            // Title of the index page; defaults to the npm package name.
            name: 'Code reference',
            // Module overview pages are only generated with an explicit entry file name.
            entryFileName: 'index.md',
            // Each module and its members on one page. Keep the kind headings (`## Functions`):
            // src/route-data.ts reads them to list members in the sidebar.
            router: 'module',
            // Fewer headings: signatures as code blocks; parameters and properties as tables.
            useCodeBlocks: true,
            parametersFormat: 'table',
            interfacePropertiesFormat: 'table',
            typeAliasPropertiesFormat: 'table',
            // Each member already links its source; the column squeezes the table.
            tableColumnSettings: { hideSources: true },
          },
        }),
        // Generated from Zod by `npm run generate:artifact-openapi`; `test:contract` keeps it fresh.
        starlightOpenAPI([
          {
            base: 'http-api',
            schema: '../docs/api/artifact.openapi.json',
            sidebar: {
              label: 'HTTP API',
              collapsed: false,
              operations: { badges: true },
            },
          },
        ]),
      ],
      sidebar: [
        ...openAPISidebarGroups,
        // starlight-typedoc's own sidebar group expects one page per member, so list the
        // generated module pages instead; src/route-data.ts groups them by folder.
        {
          label: 'Code reference',
          items: [{ autogenerate: { directory: 'code' } }],
        },
      ],
    }),
  ],
  vite: {
    plugins: [
      tailwindcss(),
      // Local Tailwind versions of selected starlight-openapi components, in src/components/openapi/.
      openAPIComponentOverrides([
        'Key.astro',
        'Tag.astro',
        'Tags.astro',
        'Type.astro',
        'operation/OperationMethodBadge.astro',
      ]),
    ],
  },
})
