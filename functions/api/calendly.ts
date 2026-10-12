/**
 * POST /api/calendly — Calendly webhook → Airtable CRM (Contact + Booking).
 * Handles invitee.created and invitee.canceled. Verifies the Calendly-Webhook-Signature header
 * (HMAC-SHA256 of "<t>.<raw body>" with the webhook signing key) and rejects events older than 5 minutes.
 */
import { CRM, create, findOne, formulaString, json, update, upsertContact, type CrmEnv } from '../_lib/crm';

interface Env extends CrmEnv {
  CALENDLY_SIGNING_KEY: string;
}

const TOLERANCE_SECONDS = 300;

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(header: string | null, raw: string, key: string, now = Date.now()): Promise<boolean> {
  if (!header || !key) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(now / 1000 - Number(t)) > TOLERANCE_SECONDS) return false;
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(`${t}.${raw}`));
  return safeEqual(hex(sig), v1);
}

function intakeText(qa: Array<{ question: string; answer: string }> = []): string {
  return qa.map((x) => `${x.question}\n${x.answer}`).join('\n\n');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const raw = await request.text();
  if (!(await verifySignature(request.headers.get('Calendly-Webhook-Signature'), raw, env.CALENDLY_SIGNING_KEY))) {
    return json({ ok: false }, 401);
  }

  let evt: any;
  try {
    evt = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 400);
  }

  const p = evt.payload ?? {};
  const inviteeUri: string | undefined = p.uri;
  if (!inviteeUri) return json({ ok: true, ignored: 'no invitee' });

  try {
    const existing = await findOne(env, CRM.bookings, `{Calendly Invitee URI}=${formulaString(inviteeUri)}`);

    if (evt.event === 'invitee.canceled') {
      const fields = {
        Status: p.rescheduled ? 'Rescheduled' : 'Cancelled',
        'Cancel Reason': p.cancellation?.reason || undefined,
      };
      if (existing) await update(env, CRM.bookings, existing.id, fields);
      return json({ ok: true });
    }

    if (evt.event === 'invitee.created') {
      if (existing) return json({ ok: true, duplicate: true }); // Calendly retries; stay idempotent
      const contactId = await upsertContact(env, { name: p.name, email: p.email, source: 'Booking' });
      await create(env, CRM.bookings, {
        Event: p.scheduled_event?.name || 'Intro call',
        Status: 'Booked',
        Start: p.scheduled_event?.start_time,
        Contact: [contactId],
        'Invitee Name': p.name,
        'Invitee Email': p.email,
        'Intake Answers': intakeText(p.questions_and_answers) || undefined,
        'Calendly Invitee URI': inviteeUri,
        'Calendly Event URI': p.event || p.scheduled_event?.uri,
      });
      return json({ ok: true });
    }

    return json({ ok: true, ignored: evt.event });
  } catch (err) {
    console.error('calendly: CRM write failed', err);
    return json({ ok: false }, 502); // non-2xx makes Calendly retry
  }
};
