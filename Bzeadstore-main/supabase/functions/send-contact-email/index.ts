// @ts-nocheck
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const ALLOWED_ORIGINS = [
  'https://www.bzead.com',
  'https://bzead.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  // Capacitor / Ionic mobile WebView origins (Android uses https://localhost when androidScheme is 'https')
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

let _activeReq: Request | undefined;

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...getCorsHeaders(_activeReq),
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

function sanitize(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

Deno.serve(async (req) => {
  _activeReq = req;
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const smtpHost = Deno.env.get('MSG91_SMTP_HOST')?.trim() || 'smtp.mailer91.com';
  const smtpPort = Number(Deno.env.get('MSG91_SMTP_PORT')?.trim() || '587');
  const smtpUser = Deno.env.get('MSG91_SMTP_USER')?.trim();
  const smtpPass = Deno.env.get('MSG91_SMTP_PASSWORD')?.trim();
  const fromEmail = Deno.env.get('CONTACT_FROM_EMAIL')?.trim() || Deno.env.get('MSG91_FROM_EMAIL')?.trim() || 'no-reply@mail.bzead.com';
  const toEmail = Deno.env.get('CONTACT_TO_EMAIL')?.trim() || 'info@bzead.com';

  if (!smtpUser || !smtpPass) {
    return json({ ok: false, error: 'Missing MSG91 SMTP credentials (MSG91_SMTP_USER / MSG91_SMTP_PASSWORD)' }, { status: 500 });
  }

  let payload: { name?: string; email?: string; message?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  const name = sanitize(payload.name);
  const email = sanitize(payload.email);
  const message = sanitize(payload.message);

  if (!name || name.length < 2) {
    return json({ ok: false, error: 'Please enter a valid name' }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'Please enter a valid email address' }, { status: 400 });
  }

  if (!message || message.length < 10) {
    return json({ ok: false, error: 'Message must be at least 10 characters' }, { status: 400 });
  }

  if (message.length > 3000) {
    return json({ ok: false, error: 'Message is too long' }, { status: 400 });
  }

  const subject = `[BZEAD Contact] New message from ${name}`;
  const text = [
    'You received a new contact form message.',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    '',
    'Message:',
    message,
  ].join('\n');

  const html = `
    <h2>New Contact Form Message</h2>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Message:</strong></p>
    <p style="white-space:pre-line;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  `;

  const client = new SMTPClient({
    connection: {
      hostname: smtpHost,
      port: smtpPort,
      tls: smtpPort === 465,
      auth: { username: smtpUser, password: smtpPass },
    },
    debug: { log: false },
  });

  try {
    await client.send({
      from: `BZEAD Contact <${fromEmail}>`,
      to: [toEmail],
      replyTo: email,
      subject,
      content: text,
      html,
    });
  } catch (err: any) {
    try { await client.close(); } catch { /* noop */ }
    const errorMsg = (err && err.message) ? String(err.message).slice(0, 300) : 'Failed to send email via MSG91 SMTP';
    console.error('[send-contact-email] SMTP error:', errorMsg);
    return json({ ok: false, error: errorMsg }, { status: 502 });
  }

  try { await client.close(); } catch { /* noop */ }
  return json({ ok: true, id: `msg91-${Date.now()}` });
});
