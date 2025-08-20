import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { OpenAI } from 'openai';

// --- Setup ---
const app = express();
app.use(cors());
app.use(express.json());

// --- Health checks ---
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'blvckai-server', status: 'running' });
});

app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    runtime: 'node',
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    hasBeehiiv: !!process.env.BEEHIIV_API_KEY && !!process.env.BEEHIIV_PUBLICATION_ID
  });
});

// --- Chat endpoint (POST /api/chat) ---
// Expects: { messages: [{ role: 'user'|'assistant'|'system', content: '...' }, ...] }
app.post('/api/chat', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(501).json({ error: 'OpenAI not configured (missing OPENAI_API_KEY)' });
    }
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [{ role: 'user', content: 'Say hello' }];
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7
    });
    const content = r.choices?.[0]?.message?.content ?? '…';
    res.json({ ok: true, content });
  } catch (e) {
    console.error('Chat error:', e);
    res.status(500).json({ error: 'Chat failed', details: e?.message || String(e) });
  }
});

// --- Waitlist: Beehiiv subscribe (POST /subscribe) ---
// Expects: { email: 'you@example.com', utm_source?: 'blvckai', send_welcome_email?: true }
app.post('/subscribe', async (req, res) => {
  try {
    const { email, utm_source = 'blvckai', send_welcome_email = true } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const key = process.env.BEEHIIV_API_KEY;
    const pub = process.env.BEEHIIV_PUBLICATION_ID;
    if (!key || !pub) {
      return res.status(501).json({ error: 'Beehiiv not configured (missing BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID)' });
    }

    const r = await fetch(`https://api.beehiiv.com/v2/publications/${pub}/subscriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, utm_source, send_welcome_email })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.message || data?.error || 'Subscription failed';
      return res.status(r.status).json({ error: msg });
    }
    res.json({ ok: true, id: data?.data?.id || data?.id || null });
  } catch (e) {
    console.error('Subscribe error:', e);
    res.status(500).json({ error: 'Subscribe failed', details: e?.message || String(e) });
  }
});

// --- Start server on Render-provided port ---
const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Blvck Ai server listening on ${PORT}`);
});
