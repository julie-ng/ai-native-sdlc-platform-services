// Documentation site for Platform Services, published to GitHub Pages.
// `site` and `base` match the project Pages URL: https://julie-ng.github.io/ai-native-sdlc-platform-services/
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

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
      sidebar: [],
    }),
  ],
})
