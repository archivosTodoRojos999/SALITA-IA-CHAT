import { extractText } from '../lib/core.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const text = await extractText(String(body?.name || ''), String(body?.data || ''));
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'No pude leer ese archivo: ' + (e.message || 'error') });
  }
}
