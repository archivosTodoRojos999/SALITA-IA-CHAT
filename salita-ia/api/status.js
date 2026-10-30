import { hasApiKey, MODEL, PROVIDER } from '../lib/core.js';

export default function handler(req, res) {
  res.status(200).json({ ok: true, keyConfigured: hasApiKey(), model: MODEL, provider: PROVIDER });
}
