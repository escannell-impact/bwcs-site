# bwcstexas.com

Astro static site on Cloudflare Pages. Content comes from the Airtable **BWCS Site — Content** base at build time.

## Develop
    npm install
    npm run dev          # uses src/data/snapshot.json when AIRTABLE_TOKEN is unset

## Content
- Edit content in Airtable. Only records with **Published** checked appear.
- Fields marked "(internal)" are never read by the build.
- `AIRTABLE_TOKEN=… npm run snapshot` refreshes the local snapshot (public fields only).

## Deploy
Cloudflare Pages, build command `npm run build`, output `dist`.
Environment variables: `AIRTABLE_TOKEN` (read-only, Content base), `AIRTABLE_CONTENT_BASE`.
Preview deployments on *.pages.dev are served with `X-Robots-Tag: noindex`.
