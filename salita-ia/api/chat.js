import { hasApiKey, PROVIDER, runChat } from '../lib/core.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    if (!hasApiKey()) {
      const keyName = PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
      return res.status(500).json({ error: `Falta configurar ${keyName}. En Vercel: Settings → Environment Variables.` });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !Array.isArray(body.messages) || !body.messages.length) return res.status(400).json({ error: 'Mensaje vacío' });
    const out = await runChat(body.messages, !!body.noTools);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno' });
  }
}
