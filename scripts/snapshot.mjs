// Refreshes src/data/snapshot.json from the Airtable Content base.
// Writes only allowlisted public fields, so internal notes never land in the repo.
// Usage: AIRTABLE_TOKEN=... npm run snapshot
import { writeFile } from 'node:fs/promises';

const BASE = process.env.AIRTABLE_CONTENT_BASE ?? 'app5njehblIt3xeBM';
const TOKEN = process.env.AIRTABLE_TOKEN;
if (!TOKEN) { console.error('AIRTABLE_TOKEN is not set'); process.exit(1); }

const PUBLIC = {
  profile: ['Name','One-liner','Availability Status','Available From','Lead Time','Engagement Types','Work Arrangement','Travel','Notice Period','Work Authorization','Clearance','Rate Range','Publish Rate','Time Zone','Location','Languages','Email','LinkedIn','Booking URL','Target Roles','Sectors'],
  engagements: ['Title','Slug','Sort Order','Sector','Role','Engaged Via','Start','End','Current','Modules','Scale','Problem','What I Owned','Outcome','Team','Delivery','Headline','Narrative','Result Figure','Result Label'],
  history: ['Title','Period','Organization','Detail','Sort Order'],
  credentials: ['Name','Issuer','Status','Sort Order'],
  modules: ['Module','Full Name','Level','Sort Order'],
};
const TABLES = { profile: 'tblBOBIjZRVgNHsGa', engagements: 'tblvmxr6LnEOwi5jn', credentials: 'tbl1GkaFjTfm319p1', modules: 'tbl9ESkWhp3JWHAXX', history: 'tblCjZ6CF7iiQnteM' };
const FILTER = { engagements: '{Published}', credentials: '{Published}', history: '{Published}' };

async function rows(key) {
  const out = []; let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLES[key]}`);
    if (FILTER[key]) url.searchParams.set('filterByFormula', FILTER[key]);
    for (const f of PUBLIC[key]) url.searchParams.append('fields[]', f);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`${key}: ${res.status} ${await res.text()}`);
    const body = await res.json();
    out.push(...body.records.map((r) => r.fields)); offset = body.offset;
  } while (offset);
  return out;
}

const [profile, engagements, credentials, modules, history] = await Promise.all(Object.keys(TABLES).map(rows));
await writeFile(new URL('../src/data/snapshot.json', import.meta.url),
  JSON.stringify({ profile: profile[0], engagements, credentials, modules, history }, null, 2) + '\n');
console.log(`snapshot: ${engagements.length} engagements, ${credentials.length} credentials, ${modules.length} modules`);
