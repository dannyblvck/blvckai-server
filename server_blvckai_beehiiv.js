import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

// Health check (lets us confirm the server is up)
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'blvckai-server', status: 'running' });
});

// Chat endpoint (works if OPENAI_API_KEY is set)
app.post('/api/chat', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(501).json({ error: 'OpenAI not configured (missing OPENAI_API_KEY)' });
    }
    const messages = req.body?.messages ?? [{ role: 'user', content: 'Say hello' }];
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7
    });
    res.json({ content: r.choices?.[0]?.message?.content ?? '…' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

// IMPORTANT: Render requires listening on process.env.PORT
const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Blvck Ai server listening on ${PORT}`);
});
