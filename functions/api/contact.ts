/**
 * POST /api/contact — contact form → Airtable CRM (Contact + Inquiry).
 * Spam controls: Cloudflare Turnstile, a honeypot field, and length limits.
 * Ben is notified by an Airtable automation on new Inquiries, not from here.
 */
import { CRM, create, json, upsertContact, type CrmEnv } from '../_lib/crm';

interface Env extends CrmEnv {
  TURNSTILE_SECRET?: string;
}

const INQUIRY_TYPES = ['Role / submission', 'Project', 'Partnership', 'Other'];
const ENGAGEMENT_TYPES = ['1099', 'C2C', 'W2', 'Not sure'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) return request.json();
  return Object.fromEntries((await request.formData()).entries());
}

async function turnstileOk(env: Env, token: string, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true; // not configured yet (preview) — honeypot still applies
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const out: { success?: boolean } = await res.json();
  return !!out.success;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let data: Record<string, unknown>;
  try {
    data = await readBody(request);
  } catch {
    return json({ ok: false, error: 'Could not read the form.' }, 400);
  }

  // Honeypot: real people never fill this. Pretend success so bots learn nothing.
  if (clip(data.website, 200)) return json({ ok: true });

  const name = clip(data.name, 120);
  const email = clip(data.email, 200).toLowerCase();
  const company = clip(data.company, 160);
  const message = clip(data.message, 5000);
  const inquiryType = INQUIRY_TYPES.includes(String(data.inquiryType)) ? String(data.inquiryType) : 'Other';
  const engagementType = ENGAGEMENT_TYPES.includes(String(data.engagementType)) ? String(data.engagementType) : undefined;
  const startTiming = clip(data.startTiming, 120);
  const page = clip(data.page, 500);

  const errors: Record<string, string> = {};
  if (!name) errors.name = 'Please add your name.';
  if (!EMAIL.test(email)) errors.email = 'Please add a valid email address.';
  if (message.length < 10) errors.message = 'Please add a short message.';
  if (Object.keys(errors).length) return json({ ok: false, errors }, 422);

  const token = clip(data['cf-turnstile-response'], 2048);
  if (!(await turnstileOk(env, token, request.headers.get('CF-Connecting-IP')))) {
    return json({ ok: false, error: 'Verification failed. Please try again.' }, 403);
  }

  try {
    const contactId = await upsertContact(env, { name, email, company, source: 'Contact form' });
    await create(env, CRM.inquiries, {
      Summary: `${inquiryType} — ${company || name}`,
      Status: 'New',
      Contact: [contactId],
      'Name (as submitted)': name,
      'Email (as submitted)': email,
      'Company (as submitted)': company || undefined,
      'Inquiry Type': inquiryType,
      'Engagement Type': engagementType,
      'Start Timing': startTiming || undefined,
      Message: message,
      Page: page.startsWith('http') ? page : undefined,
    });
    return json({ ok: true });
  } catch (err) {
    console.error('contact: CRM write failed', err);
    return json({ ok: false, error: 'Something went wrong on our side. Please email benjamin@bwcstexas.com.' }, 502);
  }
};
