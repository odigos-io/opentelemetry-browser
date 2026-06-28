// Metadata describing how to serve each test-app in the e2e harness.
//
// - static apps (React/Vue/Angular) build to a directory of files which the harness serves directly.
// - ssr apps (Next.js/Nuxt/SvelteKit) build a Node server which we spawn; the harness reverse-proxies
//   to it. `start` runs in the app directory after a production build.
//
// Paths are relative to the repository root.
export const APPS = {
  react: {
    type: 'static',
    dir: 'test-apps/react-app',
    staticDir: 'test-apps/react-app/dist',
  },
  vue: {
    type: 'static',
    dir: 'test-apps/vue-app',
    staticDir: 'test-apps/vue-app/dist',
  },
  angular: {
    type: 'static',
    dir: 'test-apps/angular-app',
    // The Angular application builder emits to dist/<project>/browser.
    staticDir: 'test-apps/angular-app/dist/angular-app/browser',
  },
  next: {
    type: 'ssr',
    dir: 'test-apps/next-app',
    start: ['npm', 'start'],
    port: 3000,
    env: { PORT: '3000', HOST: '0.0.0.0' },
  },
  nuxt: {
    type: 'ssr',
    dir: 'test-apps/nuxt-app',
    start: ['node', '.output/server/index.mjs'],
    port: 3000,
    env: { PORT: '3000', NITRO_PORT: '3000', HOST: '0.0.0.0' },
  },
  sveltekit: {
    type: 'ssr',
    dir: 'test-apps/sveltekit-app',
    start: ['node', 'build/index.js'],
    port: 3000,
    env: { PORT: '3000', HOST: '0.0.0.0' },
  },
}

export const FRAMEWORKS = Object.keys(APPS)
export const BROWSERS = ['chromium', 'firefox', 'webkit']
