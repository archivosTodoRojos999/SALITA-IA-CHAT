// Núcleo de Salita IA: lo usan tanto Vercel (api/*.js) como el servidor local (server.js)
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { buildPdf, buildDocx, buildPptx, buildXlsx } from '../docs.js';

export const PROVIDER = process.env.SALITA_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'anthropic');
export const MODEL = process.env.SALITA_MODEL || (PROVIDER === 'gemini' ? 'gemini-2.5-flash' : 'claude-sonnet-5-5');

export function hasApiKey() {
  return PROVIDER === 'gemini' ? !!process.env.GEMINI_API_KEY : PROVIDER === 'anthropic' && !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = `Eres Salita IA, un asistente de inteligencia artificial simpático, cálido y muy inteligente. Hablas en el idioma del usuario (por defecto español rioplatense, cercano y alegre, con algún emoji de vez en cuando, sin exagerar).

REGLAS DE ORO
1. DECÍ SIEMPRE LA VERDAD. Si no sabés algo o no está en los archivos, decilo claramente. Nunca inventes datos, cifras, citas, páginas ni fuentes.
2. Cuando el usuario te da archivos (PDF, imágenes, Word, Excel, texto), leelos COMPLETOS y con mucho cuidado antes de responder. Basá tu respuesta en lo que realmente dice el material y, cuando sirva, indicá dónde lo encontraste (página, imagen N, hoja, sección).
3. Antes de responder, revisá mentalmente tu respuesta: ¿está respaldada por el material?, ¿las cuentas están bien?, ¿respondí exactamente lo que se pidió? Corregí cualquier error antes de enviar.
4. Si el pedido es ambiguo, hacé UNA pregunta corta; si no, resolvé directamente.
5. Sé claro y preciso: respuestas bien organizadas, con títulos, listas y tablas cuando ayuden.
6. Si algo se ve borroso o ilegible en una imagen, decilo en vez de adivinar.
7. Si en la conversación aparece una nota como "[Imagen enviada antes: ...]", significa que esa imagen ya fue analizada en un mensaje anterior y no la tenés a la vista ahora: apoyate en tu análisis previo y, si hace falta ver el detalle de nuevo, pedile al usuario que la vuelva a enviar.

HERRAMIENTAS
- create_document: cuando el usuario pida un PDF, Word, PowerPoint o Excel (o diga "armame un informe/presentación/planilla"), usá esta herramienta para generar el archivo real con contenido profesional, completo y bien estructurado. Para PowerPoint cada "section" es una diapositiva (títulos cortos, 3-6 viñetas breves). Para Excel usá "sheets" con encabezados y filas (podés usar fórmulas que empiecen con "=").
- create_app: cuando el usuario pida una app, página web, calculadora, juego o herramienta, generá UN solo archivo HTML completo (HTML+CSS+JS embebidos), moderno, colorido y responsive.
Después de crear un archivo, contale brevemente qué incluye y ofrecé ajustes.`;

const TOOLS = [
  {
    name: 'create_document',
    description: 'Genera un archivo descargable PDF, Word (docx), PowerPoint (pptx) o Excel (xlsx) con diseño profesional y colorido.',
    input_schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['pdf', 'docx', 'pptx', 'xlsx'] },
        title: { type: 'string', description: 'Título del documento' },
        subtitle: { type: 'string' },
        sections: {
          type: 'array',
          description: 'Secciones del documento (en PowerPoint, cada una es una diapositiva)',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              text: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
              table: {
                type: 'object',
                properties: {
                  headers: { type: 'array', items: { type: 'string' } },
                  rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number'] } } }
                },
                required: ['headers', 'rows']
              }
            }
          }
        },
        sheets: {
          type: 'array',
          description: 'Solo para Excel: hojas con encabezados y filas',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              headers: { type: 'array', items: { type: 'string' } },
              rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number'] } } }
            },
            required: ['name', 'headers', 'rows']
          }
        }
      },
      required: ['format', 'title']
    }
  },
  {
    name: 'create_app',
    description: 'Crea una app o página web en un único archivo HTML autocontenido.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        html: { type: 'string', description: 'Documento HTML completo con CSS y JS embebidos' }
      },
      required: ['title', 'html']
    }
  }
];

const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  html: 'text/html'
};

const slug = (s) => String(s || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'documento';

// Devuelve el archivo en base64 (en Vercel no hay disco persistente)
async function makeFile(use) {
  let ext, buf, title;
  if (use.name === 'create_app') {
    ext = 'html';
    title = use.input.title;
    buf = Buffer.from(String(use.input.html || ''), 'utf8');
  } else {
    const d = use.input;
    ext = d.format;
    title = d.title;
    if (ext === 'pdf') buf = await buildPdf(d);
    else if (ext === 'docx') buf = await buildDocx(d);
    else if (ext === 'pptx') buf = await buildPptx(d);
    else if (ext === 'xlsx') buf = await buildXlsx(d);
    else throw new Error('Formato no soportado: ' + ext);
  }
  return { id: Math.random().toString(36).slice(2), name: `${slug(title)}.${ext}`, ext, title, mime: MIME[ext], b64: Buffer.from(buf).toString('base64') };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Llamada a la API con reintentos automáticos (límites, sobrecarga, cortes de red)
async function callAnthropic(body) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000)
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j;
      const msg = j?.error?.message || `Error de la API (${r.status})`;
      if ([429, 500, 502, 503, 529].includes(r.status) && attempt < 2) { lastErr = new Error(msg); await sleep(1500 * (attempt + 1)); continue; }
      if (r.status === 401) throw new Error('La clave de API no es válida. Revisá ANTHROPIC_API_KEY.');
      throw new Error(msg);
    } catch (e) {
      lastErr = e;
      const transient = e.name === 'TimeoutError' || e.name === 'AbortError' || e.cause || /fetch failed/i.test(e.message);
      if (transient && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
      throw e;
    }
  }
  throw lastErr;
}

function geminiSchema(schema) {
  const type = Array.isArray(schema.type) ? 'string' : schema.type;
  return {
    ...schema,
    ...(type ? { type: type.toUpperCase() } : {}),
    ...(schema.properties ? { properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, geminiSchema(value)])) } : {}),
    ...(schema.items ? { items: geminiSchema(schema.items) } : {})
  };
}

function toGeminiContents(messages, toolNames) {
  return messages.map((message) => {
    const parts = (Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content || '' }]).flatMap((block) => {
      if (block.type === 'text') return [{ text: block.text }];
      if (block.type === 'image' || block.type === 'document') {
        return [{ inlineData: { mimeType: block.source.media_type, data: block.source.data } }];
      }
      if (block.type === 'tool_use') {
        toolNames.set(block.id, block.name);
        return [{ functionCall: { name: block.name, args: block.input || {} } }];
      }
      if (block.type === 'tool_result') {
        return [{ functionResponse: { name: toolNames.get(block.tool_use_id) || 'create_document', response: { result: block.content } } }];
      }
      return [];
    });
    return { role: message.role === 'assistant' ? 'model' : 'user', parts };
  }).filter((message) => message.parts.length);
}

async function callGemini(body, toolNames) {
  const model = encodeURIComponent(body.model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const payload = {
    systemInstruction: { parts: [{ text: body.system }] },
    contents: toGeminiContents(body.messages, toolNames),
    generationConfig: { maxOutputTokens: body.max_tokens },
    ...(body.tools ? { tools: [{ functionDeclarations: body.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: geminiSchema(tool.input_schema) })) }] } : {})
  };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || `Error de Gemini (${response.status})`;
        if ([429, 500, 502, 503].includes(response.status) && attempt < 2) { lastErr = new Error(message); await sleep(1500 * (attempt + 1)); continue; }
        if (response.status === 401 || response.status === 403) throw new Error('La clave de Gemini no es válida. Revisá GEMINI_API_KEY.');
        throw new Error(message);
      }
      const candidate = data.candidates?.[0];
      if (!candidate) throw new Error(data.promptFeedback?.blockReason ? 'Gemini bloqueó este pedido por sus políticas de seguridad.' : 'Gemini no devolvió una respuesta.');
      const content = (candidate.content?.parts || []).flatMap((part) => {
        const blocks = [];
        if (part.text) blocks.push({ type: 'text', text: part.text });
        if (part.functionCall) {
          const id = `gemini_${Math.random().toString(36).slice(2)}`;
          toolNames.set(id, part.functionCall.name);
          blocks.push({ type: 'tool_use', id, name: part.functionCall.name, input: part.functionCall.args || {} });
        }
        return blocks;
      });
      return { content, stop_reason: content.some((block) => block.type === 'tool_use') ? 'tool_use' : 'end_turn' };
    } catch (error) {
      lastErr = error;
      const transient = error.name === 'TimeoutError' || error.name === 'AbortError' || error.cause || /fetch failed/i.test(error.message);
      if (transient && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
      throw error;
    }
  }
  throw lastErr;
}

export async function runChat(messages, noTools) {
  const files = [];
  const msgs = [...messages];
  const toolNames = new Map();
  for (let i = 0; i < 6; i++) {
    const request = {
      model: MODEL,
      max_tokens: 12000,
      system: SYSTEM,
      messages: msgs,
      ...(noTools ? {} : { tools: TOOLS })
    };
    const j = PROVIDER === 'gemini' ? await callGemini(request, toolNames) : await callAnthropic(request);
    const uses = j.content.filter((b) => b.type === 'tool_use');
    if (j.stop_reason !== 'tool_use' || !uses.length) {
      const text = j.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { text: text || (files.length ? '¡Listo! Acá tenés tu archivo 🎉' : '...'), files };
    }
    msgs.push({ role: 'assistant', content: j.content });
    const results = [];
    for (const u of uses) {
      try {
        const f = await makeFile(u);
        files.push(f);
        results.push({ type: 'tool_result', tool_use_id: u.id, content: `Archivo creado correctamente: ${f.name}` });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'No se pudo crear el archivo: ' + e.message });
      }
    }
    msgs.push({ role: 'user', content: results });
  }
  return { text: 'Hice varios intentos y no pude terminar. ¿Probamos de nuevo?', files };
}

export async function extractText(name, b64) {
  const buf = Buffer.from(b64, 'base64');
  const lower = name.toLowerCase();
  if (lower.endsWith('.docx')) {
    const r = await mammoth.extractRawText({ buffer: buf });
    return r.value;
  }
  if (lower.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    let out = '';
    wb.eachSheet((ws) => {
      out += `\n## Hoja: ${ws.name}\n`;
      ws.eachRow((row) => {
        const vals = row.values.slice(1).map((v) => (v && typeof v === 'object' ? (v.result ?? v.text ?? JSON.stringify(v)) : (v ?? '')));
        out += vals.join(' | ') + '\n';
      });
    });
    return out;
  }
  throw new Error('Formato no soportado para extraer texto');
}
