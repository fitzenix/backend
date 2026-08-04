import { defineConfig } from 'tsup';

/**
 * Production build. Dependencies are externalised (tsup does this for anything
 * in `dependencies`), so dynamic imports (razorpay, @aws-sdk) stay lazy.
 */
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  splitting: false,
  minify: false,
});
