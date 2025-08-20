import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import Stripe from 'stripe';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());

// Simple per-IP token bucket (30 req/hour)
const BUCKET = new Map();
const CAP = 30, REFILL_SEC = 3600;
function allow(ip){
  const now = Date.now()/1000;
  const b = BUCKET.get(ip) || { tokens: CAP, updated: now };
  const elapsed = now - b.updated;
  const refill = Math.floor(elapsed / REFILL_SEC) * CAP;
  b.tokens = Math.min(CAP, b.tokens + refill);
  b.updated = now;
  if(b.tokens <= 0){ BUCKET.set(ip,b); return false; }
  b.tokens -= 1; BUCKET.set(ip,b); return true;
}
app.use((req,res,next)=>{
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'local';
  if(!allow(ip)) return res.status(429).json({ error: 'Rate limit exceeded' });
  next();
});

// ---- Chat -> OpenAI ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/api/chat', async (req, res) => {
  try {
    const messages = req.body?.messages ?? [{ role: 'user', content: 'Say hello' }];
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7
    });
    res.json({ content: response.choices?.[0]?.message?.content ?? '…' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ---- Beehiiv subscribe (optional) ----
app.post('/subscribe', async (req,res)=>{
  try{
    const { email, utm_source='blvckai', send_welcome_email=true } = req.body || {};
    if(!email) return res.status(400).json({ error: 'Email is required' });

    const key = process.env.BEEHIIV_API_KEY;
    const pub = process.env.BEEHIIV_PUBLICATION_ID;
    if(!key || !pub) return res.status(501).json({ error: 'Beehiiv not configured' });

    const r = await fetch(`https://api.beehiiv.com/v2/publications/${pub}/subscriptions`, {
      method:'POST',
      headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ email, utm_source, send_welcome_email })
    });
    const data = await r.json();
    if(!r.ok) return res.status(r.status).json({ error: data?.message || 'Subscription failed' });
    res.json({ ok:true, id:data?.data?.id || data?.id || null });
  }catch(e){ console.error(e); res.status(500).json({ error: e.message }); }
});

// ---- Stripe checkout (optional) ----
const stripe = process.env.STRIPE_SECRET ? new Stripe(process.env.STRIPE_SECRET) : null;
app.post('/create-checkout-session', async (req,res)=>{
  try{
    if(!stripe) return res.status(501).json({ error:'Stripe not configured' });
    const p

