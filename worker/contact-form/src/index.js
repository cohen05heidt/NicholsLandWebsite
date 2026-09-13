/**
 * nichols-contact-form — the small server the website doesn't have.
 *
 * The site is static: it is a folder of files on GitHub Pages with nothing
 * running behind it. That is a good thing for a site that must not go down,
 * but it means there is nowhere to keep a secret. A Resend API key pasted into
 * assets/js/app.js would be readable by anyone who opened View Source, and
 * anyone who read it could send mail as Nichols Land until it was revoked.
 *
 * So the key lives here instead — as a Cloudflare secret, on Cloudflare's
 * machines, never in the repository. The browser posts the form to this
 * Worker; this Worker is the only thing that ever sees the key.
 *
 * Configuration (Cloudflare dashboard → the Worker → Settings → Variables):
 *
 *   RESEND_API_KEY   secret   the key from resend.com/api-keys — Encrypt it
 *   TO_EMAIL         plain    where inquiries land, e.g. gwilliams@nicholsland.net
 *   FROM_EMAIL       plain    must be on a domain verified in Resend
 *   ALLOWED_ORIGINS  plain    comma-separated site origins allowed to post here
 *   CC_EMAIL         plain    optional, comma-separated extra recipients
 *
 * Deploy notes live in README.md next to this file.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

/* Fields the form sends that are not part of the message body. `website` is a
   honeypot (see the hidden input in index.html) and `t` is the timestamp the
   page was rendered — both exist only to catch bots, and neither belongs in
   the email. */
const NOT_CONTENT = new Set(['website', 't', 'consent']);

/* Pretty names for the email, so the person reading it sees "County of
   interest" rather than the input's name attribute. Anything not listed here
   still gets through — it just keeps its raw name, which is better than being
   silently dropped if someone adds a field to the form and forgets this map. */
const LABELS = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  subject: 'Subject',
  county: 'County of interest',
  acres: 'Acreage range',
  message: 'Message',
};

/* Order the email in the order a person would want to read it; unknown fields
   fall in after these, in the order they arrived. */
const FIELD_ORDER = ['name', 'email', 'phone', 'subject', 'county', 'acres', 'message'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

/* Only origins named in ALLOWED_ORIGINS may post here. Without this the Worker
   URL is a free mailer for anyone who finds it in the page source. */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = list(env.ALLOWED_ORIGINS);
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    _ok: ok,
  };
}

const reply = (status, body, cors) => {
  const { _ok, ...headers } = cors;
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
};

/* Accepts either a multipart form post (what the site sends) or JSON (handy
   for testing with curl). Repeated names — subject[] — come back as arrays. */
async function readSubmission(request) {
  const type = request.headers.get('Content-Type') || '';

  if (type.includes('application/json')) {
    const raw = await request.json();
    const out = {};
    for (const [k, v] of Object.entries(raw)) out[k.replace(/\[\]$/, '')] = v;
    return out;
  }

  const fd = await request.formData();
  const out = {};
  for (const key of new Set(fd.keys())) {
    const all = fd.getAll(key).map((v) => (typeof v === 'string' ? v : ''));
    const clean = key.replace(/\[\]$/, '');
    out[clean] = key.endsWith('[]') ? all : all.length > 1 ? all : all[0];
  }
  return out;
}

function orderedEntries(data) {
  const seen = new Set();
  const rows = [];
  const push = (k) => {
    if (seen.has(k) || NOT_CONTENT.has(k)) return;
    seen.add(k);
    const v = data[k];
    const text = Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v ?? '').trim();
    if (text) rows.push([LABELS[k] || k, text]);
  };
  FIELD_ORDER.forEach(push);
  Object.keys(data).forEach(push);
  return rows;
}

function buildEmail(rows, meta) {
  const text =
    rows.map(([label, value]) => `${label}: ${value}`).join('\n') +
    `\n\n— Sent from the contact form at ${meta.origin || 'nicholsland'} on ${meta.when}.`;

  const html = `<!doctype html>
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#22362A;max-width:620px">
  <p style="margin:0 0 18px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7a70">
    New website inquiry
  </p>
  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
    ${rows
      .map(
        ([label, value]) => `<tr>
      <td style="padding:9px 16px 9px 0;vertical-align:top;white-space:nowrap;color:#6b7a70;border-bottom:1px solid #e6e3dc">${esc(label)}</td>
      <td style="padding:9px 0;vertical-align:top;border-bottom:1px solid #e6e3dc;white-space:pre-wrap">${esc(value)}</td>
    </tr>`,
      )
      .join('\n    ')}
  </table>
  <p style="margin:22px 0 0;font-size:13px;color:#6b7a70">
    Sent from the contact form at ${esc(meta.origin || 'nicholsland')} on ${esc(meta.when)}.<br>
    Replying to this email goes straight back to the person who sent it.
  </p>
</div>`;

  return { text, html };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      const { _ok, ...headers } = cors;
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') {
      return reply(405, { ok: false, error: 'Method not allowed' }, cors);
    }
    if (!cors._ok) {
      return reply(403, { ok: false, error: 'Origin not allowed' }, cors);
    }
    if (!env.RESEND_API_KEY || !env.TO_EMAIL || !env.FROM_EMAIL) {
      console.error('Worker is missing RESEND_API_KEY, TO_EMAIL or FROM_EMAIL.');
      return reply(500, { ok: false, error: 'Form is not configured' }, cors);
    }

    let data;
    try {
      data = await readSubmission(request);
    } catch {
      return reply(400, { ok: false, error: 'Could not read the submission' }, cors);
    }

    /* Two silent bot checks. Both return 200: a bot that is told it failed
       tries again differently, and a human can't trip either of these. */
    if (String(data.website || '').trim()) {
      return reply(200, { ok: true }, cors);
    }
    const rendered = Number(data.t);
    if (Number.isFinite(rendered) && rendered > 0 && Date.now() - rendered < 3000) {
      return reply(200, { ok: true }, cors);
    }

    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim();
    const message = String(data.message || '').trim();

    if (!name || !message || !EMAIL_RE.test(email)) {
      return reply(400, { ok: false, error: 'Please fill in your name, a valid email and a message.' }, cors);
    }
    /* A 20,000-character message is a bot, and Resend would reject it anyway. */
    if (message.length > 8000) {
      return reply(400, { ok: false, error: 'That message is too long to send.' }, cors);
    }

    const subjects = Array.isArray(data.subject)
      ? data.subject.filter(Boolean).join(', ')
      : String(data.subject || '').trim();

    const rows = orderedEntries(data);
    const { text, html } = buildEmail(rows, {
      origin: request.headers.get('Origin') || '',
      when: new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    });

    const payload = {
      from: env.FROM_EMAIL,
      to: list(env.TO_EMAIL),
      /* So hitting Reply in the inbox goes to the person who filled in the
         form, not to the Worker's sending address. */
      reply_to: email,
      subject: `Website inquiry — ${name}${subjects ? ` (${subjects})` : ''}`,
      text,
      html,
    };
    const cc = list(env.CC_EMAIL);
    if (cc.length) payload.cc = cc;

    let res;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Could not reach Resend:', err);
      return reply(502, { ok: false, error: 'Could not send right now' }, cors);
    }

    if (!res.ok) {
      /* Logged, not returned: Resend's errors name the sending domain and the
         key, and neither belongs in a response the browser can read. Read
         these with `npx wrangler tail` or in the Worker's live logs. */
      console.error('Resend rejected the message:', res.status, await res.text());
      return reply(502, { ok: false, error: 'Could not send right now' }, cors);
    }

    const { id } = await res.json().catch(() => ({}));
    return reply(200, { ok: true, id }, cors);
  },
};
