/**
 * Content loader. Reads the Airtable Content base at build time.
 * Without AIRTABLE_TOKEN (local dev, first preview) it falls back to src/data/snapshot.json,
 * which `npm run snapshot` refreshes from Airtable.
 *
 * Only fields listed in the mappers below ever reach a page. Fields marked "(internal)"
 * in Airtable are never read, so they cannot leak into the build.
 */
import snapshot from '../data/snapshot.json';

const BASE = import.meta.env.AIRTABLE_CONTENT_BASE ?? 'app5njehblIt3xeBM';
const TOKEN = import.meta.env.AIRTABLE_TOKEN;

export const TABLES = {
  profile: 'tblBOBIjZRVgNHsGa',
  engagements: 'tblvmxr6LnEOwi5jn',
  credentials: 'tbl1GkaFjTfm319p1',
  modules: 'tbl9ESkWhp3JWHAXX',
  history: 'tblCjZ6CF7iiQnteM',
} as const;

export interface Profile {
  name: string;
  oneLiner: string;
  availabilityStatus: 'Available now' | 'Available from date' | 'Engaged';
  availableFrom?: string;
  leadTime?: string;
  engagementTypes: string[];
  workArrangement?: string;
  travel?: string;
  noticePeriod?: string;
  workAuthorization?: string;
  clearance?: string;
  rateRange?: string;
  publishRate: boolean;
  timeZone?: string;
  location?: string;
  languages?: string;
  email?: string;
  linkedIn?: string;
  bookingUrl?: string;
  targetRoles: string[];
  sectors: string[];
}

export interface Engagement {
  title: string;
  slug: string;
  sortOrder: number;
  sector?: string;
  role?: string;
  engagedVia?: string;
  start?: string;
  end?: string;
  current: boolean;
  modules: string[];
  scale?: string;
  problem?: string;
  owned?: string;
  outcome?: string;
  team?: string;
  delivery?: string;
  headline?: string;
  narrative: string[];
  resultFigure?: string;
  resultLabel?: string;
}

export interface HistoryItem {
  title: string;
  period?: string;
  organization?: string;
  detail?: string;
  sortOrder: number;
}

export interface Credential {
  name: string;
  issuer?: string;
  status: 'Held' | 'In progress' | 'Planned';
  sortOrder: number;
}

export interface Module {
  module: string;
  fullName?: string;
  level: 'Own' | 'Advise';
  sortOrder: number;
}

type Fields = Record<string, any>;

async function fetchTable(table: string, formula?: string): Promise<Fields[]> {
  const rows: Fields[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${table}`);
    if (formula) url.searchParams.set('filterByFormula', formula);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`Airtable ${table}: ${res.status} ${await res.text()}`);
    const body = await res.json();
    rows.push(...body.records.map((r: any) => r.fields));
    offset = body.offset;
  } while (offset);
  return rows;
}

const lines = (v?: string) => (v ? v.split('\n').map((s) => s.trim()).filter(Boolean) : []);

const toProfile = (f: Fields): Profile => ({
  name: f['Name'],
  oneLiner: f['One-liner'] ?? '',
  availabilityStatus: f['Availability Status'] ?? 'Available now',
  availableFrom: f['Available From'],
  leadTime: f['Lead Time'],
  engagementTypes: f['Engagement Types'] ?? [],
  workArrangement: f['Work Arrangement'],
  travel: f['Travel'],
  noticePeriod: f['Notice Period'],
  workAuthorization: f['Work Authorization'],
  clearance: f['Clearance'],
  rateRange: f['Rate Range'],
  publishRate: !!f['Publish Rate'],
  timeZone: f['Time Zone'],
  location: f['Location'],
  languages: f['Languages'],
  email: f['Email'],
  linkedIn: f['LinkedIn'],
  bookingUrl: f['Booking URL'],
  targetRoles: lines(f['Target Roles']),
  sectors: lines(f['Sectors']),
});

const toEngagement = (f: Fields): Engagement => ({
  title: f['Title'],
  slug: f['Slug'],
  sortOrder: f['Sort Order'] ?? 99,
  sector: f['Sector'],
  role: f['Role'],
  engagedVia: f['Engaged Via'],
  start: f['Start'],
  end: f['End'],
  current: !!f['Current'],
  modules: f['Modules'] ?? [],
  scale: f['Scale'],
  problem: f['Problem'],
  owned: f['What I Owned'],
  outcome: f['Outcome'],
  team: f['Team'],
  delivery: f['Delivery'],
  headline: f['Headline'],
  narrative: (f['Narrative'] ?? '').split(/\n\s*\n/).map((x: string) => x.trim()).filter(Boolean),
  resultFigure: f['Result Figure'],
  resultLabel: f['Result Label'],
});

const toHistory = (f: Fields): HistoryItem => ({
  title: f['Title'],
  period: f['Period'],
  organization: f['Organization'],
  detail: f['Detail'],
  sortOrder: f['Sort Order'] ?? 99,
});

const toCredential = (f: Fields): Credential => ({
  name: f['Name'],
  issuer: f['Issuer'],
  status: f['Status'],
  sortOrder: f['Sort Order'] ?? 99,
});

const toModule = (f: Fields): Module => ({
  module: f['Module'],
  fullName: f['Full Name'],
  level: f['Level'],
  sortOrder: f['Sort Order'] ?? 99,
});

const bySort = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

export interface SiteContent {
  profile: Profile;
  engagements: Engagement[];
  credentials: Credential[];
  modules: Module[];
  history: HistoryItem[];
}

let cache: Promise<SiteContent> | undefined;

export function getContent(): Promise<SiteContent> {
  cache ??= load();
  return cache;
}

async function load(): Promise<SiteContent> {
  if (!TOKEN) {
    const s = snapshot as unknown as { profile: Fields; engagements: Fields[]; credentials: Fields[]; modules: Fields[]; history: Fields[] };
    return assemble(s.profile, s.engagements, s.credentials, s.modules, s.history);
  }
  const [profile, engagements, credentials, modules, history] = await Promise.all([
    fetchTable(TABLES.profile),
    fetchTable(TABLES.engagements, '{Published}'),
    fetchTable(TABLES.credentials, '{Published}'),
    fetchTable(TABLES.modules),
    fetchTable(TABLES.history, '{Published}'),
  ]);
  return assemble(profile[0], engagements, credentials, modules, history);
}

function assemble(p: Fields, e: Fields[], c: Fields[], m: Fields[], h: Fields[]): SiteContent {
  return {
    profile: toProfile(p),
    engagements: e.map(toEngagement).sort(bySort),
    credentials: c.map(toCredential).sort(bySort),
    modules: m.map(toModule).sort(bySort),
    history: h.map(toHistory).sort(bySort),
  };
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** "15 months", or "Since Sep 2025" for current engagements. */
export function durationLabel(e: Engagement): string {
  if (!e.start) return '';
  const [sy, sm] = e.start.split('-').map(Number);
  if (e.current || !e.end) return `Since ${MONTHS[sm - 1]} ${sy}`;
  const [ey, em] = e.end.split('-').map(Number);
  const months = (ey - sy) * 12 + (em - sm) + 1;
  return `${months} months`;
}

export function periodLabel(e: Engagement): string {
  if (!e.start) return '';
  const fmt = (d: string) => { const [y, m] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
  return `${fmt(e.start)} – ${e.current || !e.end ? 'present' : fmt(e.end)}`;
}
