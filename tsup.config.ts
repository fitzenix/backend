import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

function copyStickerAssets() {
  const srcDir = join(process.cwd(), 'src/utils/assets');
  const destDir = join(process.cwd(), 'dist/utils/assets');
  if (!existsSync(srcDir)) {
    console.warn('[tsup] sticker assets missing at', srcDir);
    return;
  }
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    copyFileSync(join(srcDir, name), join(destDir, name));
  }
  console.log('[tsup] copied utils/assets → dist/utils/assets');
}

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
  onSuccess: async () => {
    copyStickerAssets();
  },
});
