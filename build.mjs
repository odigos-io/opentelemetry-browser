import * as esbuild from 'esbuild';

// Bundle the browser agent into a single self-executing script that Odigos serves
// to instrumented front-end apps. The output must be loadable directly from a
// <script src="..."> tag, so we emit an IIFE with no external imports.
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2018'],
  outfile: 'dist/agent.js',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
});
