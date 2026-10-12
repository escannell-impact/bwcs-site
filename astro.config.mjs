import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://bwcstexas.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'directory' },
});
