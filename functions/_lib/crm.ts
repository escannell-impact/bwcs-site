/**
 * Airtable CRM helpers for Pages Functions.
 * Uses a token scoped to data.records:read + data.records:write on the CRM base only.
 */
export interface CrmEnv {
  AIRTABLE_CRM_TOKEN: string;
  AIRTABLE_CRM_BASE?: string;
}

export const CRM = {
  base: 'appwMmI1dJAayXkBa',
  contacts: 'tblGD4hPMMJ5RjzYT',
  inquiries: 'tblF5iHOGcKYpRHhw',
  bookings: 'tblhzHdgQsHh5STK6',
} as const;

type Fields = Record<string, unknown>;

async function call(env: CrmEnv, path: string, init: RequestInit = {}): Promise<any> {
  const base = env.AIRTABLE_CRM_BASE || CRM.base;
  const res = await fetch(`https://api.airtable.com/v0/${base}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_CRM_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Airtable ${init.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Escape a value for use inside a single-quoted Airtable formula string. */
export const formulaString = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export async function findOne(env: CrmEnv, table: string, formula: string): Promise<{ id: string; fields: Fields } | null> {
  const q = new URLSearchParams({ filterByFormula: formula, maxRecords: '1' });
  const body = await call(env, `${table}?${q}`);
  return body.records[0] ?? null;
}

export async function create(env: CrmEnv, table: string, fields: Fields): Promise<string> {
  const body = await call(env, table, { method: 'POST', body: JSON.stringify({ records: [{ fields }], typecast: true }) });
  return body.records[0].id;
}

export async function update(env: CrmEnv, table: string, id: string, fields: Fields): Promise<void> {
  await call(env, table, { method: 'PATCH', body: JSON.stringify({ records: [{ id, fields }], typecast: true }) });
}

/** Find a contact by email (case-insensitive) or create one. Fills blank fields on an existing contact. */
export async function upsertContact(
  env: CrmEnv,
  c: { name?: string; email: string; company?: string; source: 'Contact form' | 'Booking' },
): Promise<string> {
  const email = c.email.trim().toLowerCase();
  const existing = await findOne(env, CRM.contacts, `LOWER({Email})=${formulaString(email)}`);
  if (existing) {
    const patch: Fields = {};
    if (c.name && !existing.fields['Name']) patch['Name'] = c.name;
    if (c.company && !existing.fields['Company']) patch['Company'] = c.company;
    if (Object.keys(patch).length) await update(env, CRM.contacts, existing.id, patch);
    return existing.id;
  }
  return create(env, CRM.contacts, {
    Name: c.name || email,
    Email: email,
    Company: c.company || undefined,
    'First Source': c.source,
  });
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
