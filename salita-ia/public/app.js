// Salita IA - interfaz
const $ = (s) => document.querySelector(s);
const chat = $('#chat'), input = $('#input'), sendBtn = $('#send'), fileInput = $('#file'), pendingEl = $('#pending');

const BATCH_MAX = 20;        // máximo de imágenes por lote
const BATCH_CHARS = 3.2e6;   // tamaño máximo (base64) de imágenes por lote: Vercel acepta ~4.5 MB por envío
const MAX_REQ = 4.2e6;       // tamaño máximo de un envío completo
const MAX_SIDE = 1280;       // lado máximo de cada imagen
const QUALITY = 0.72;
const MAX_PDF_MB = 3;
const LOGO = 'logo.png';

let history = [];            // mensajes para la API
let pending = [];            // archivos adjuntos aún sin enviar
let busy = false;
const fileStore = {};        // archivos generados por la IA (en base64)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const logoImg = `<img src="${LOGO}" onerror="this.onerror=null;this.src='logo.svg'" alt="">`;

function toast(t) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = t;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 4000);
}

/* ---------- archivos ---------- */
const readB64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(file);
});

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      const k = Math.min(1, MAX_SIDE / Math.max(w, h));
      w = Math.round(w * k); h = Math.round(h * k);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const full = c.toDataURL('image/jpeg', QUALITY);
      const t = document.createElement('canvas');
      const tk = 80 / Math.max(w, h);
      t.width = Math.max(1, Math.round(w * tk)); t.height = Math.max(1, Math.round(h * tk));
      t.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
      URL.revokeObjectURL(url);
      resolve({ data: full.split(',')[1], thumb: t.toDataURL('image/jpeg', 0.6) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pude abrir la imagen ' + file.name)); };
    img.src = url;
  });
}

async function addFiles(list) {
  const files = [...list];
  for (const f of files) {
    const name = f.name || 'archivo';
    const lower = name.toLowerCase();
    try {
      if (f.type.startsWith('image/')) {
        const { data, thumb } = await compressImage(f);
        pending.push({ kind: 'image', name, data, thumb });
      } else if (lower.endsWith('.pdf')) {
        if (f.size > MAX_PDF_MB * 1048576) { notice(`"${name}" pesa más de ${MAX_PDF_MB} MB y la versión en internet no lo puede enviar entero. Dividilo en partes más chicas.`); continue; }
        pending.push({ kind: 'pdf', name, data: await readB64(f) });
      } else if (lower.endsWith('.docx') || lower.endsWith('.xlsx')) {
        if (f.size > 3 * 1048576) { notice(`"${name}" pesa más de 3 MB. Dividilo en partes más chicas.`); continue; }
        const r = await fetch('/api/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data: await readB64(f) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'No pude leer ' + name);
        pending.push({ kind: 'text', name, text: j.text });
      } else if (/\.(txt|csv|md|json)$/.test(lower)) {
        pending.push({ kind: 'text', name, text: await f.text() });
      } else {
        notice(`No puedo leer "${name}" todavía (formatos: imágenes, PDF, Word, Excel, TXT, CSV).`);
      }
    } catch (e) { notice(e.message); }
    renderPending();
  }
}

function renderPending() {
  pendingEl.innerHTML = '';
  const imgs = pending.filter((p) => p.kind === 'image');
  pending.forEach((p, i) => {
    if (p.kind === 'image' && imgs.indexOf(p) >= 8) return;
    const d = document.createElement('div');
    d.className = 'p';
    d.innerHTML = (p.kind === 'image' ? `<img src="${p.thumb}">` : `<span>${p.kind === 'pdf' ? '📄' : '📝'} ${esc(p.name)}</span>`) + '<button title="Quitar">✕</button>';
    d.querySelector('button').onclick = () => { pending.splice(i, 1); renderPending(); };
    pendingEl.appendChild(d);
  });
  if (imgs.length > 8) {
    const d = document.createElement('div');
    d.className = 'p';
    d.innerHTML = `<span>🖼️ +${imgs.length - 8} imágenes más (${imgs.length} en total)</span>`;
    pendingEl.appendChild(d);
  }
}

/* ---------- mensajes ---------- */
function hideWelcome() { const w = $('#welcome'); if (w) w.remove(); }
function scrollDown() { chat.scrollTop = chat.scrollHeight; }
function notice(t) { return addMsg('bot', `<p>⚠️ ${esc(t)}</p>`); }

function addMsg(who, html) {
  hideWelcome();
  const m = document.createElement('div');
  m.className = 'msg ' + who;
  m.innerHTML = `<div class="avatar">${who === 'bot' ? logoImg : 'Tú'}</div><div class="bubble">${html}</div>`;
  chat.appendChild(m);
  scrollDown();
  return m.querySelector('.bubble');
}

// Si las librerías de formato no cargaran, igual se muestra el texto (nunca queda en blanco)
const md = (t) => {
  try { if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(t, { breaks: true })); } catch (e) { /* sigue abajo */ }
  return '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>';
};
const ICON = { pdf: '📄', docx: '📝', pptx: '📊', xlsx: '📈', html: '🧩' };
const LABEL = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', xlsx: 'Excel', html: 'App' };

function filesHtml(files) {
  if (!files || !files.length) return '';
  return '<div class="files">' + files.map((f) => {
    fileStore[f.id] = f;
    const dl = `<button class="file f-${f.ext}" data-dl="${f.id}"><span style="font-size:26px">${ICON[f.ext] || '📎'}</span><span>${esc(f.name)}<small>Descargar ${LABEL[f.ext] || ''}</small></span></button>`;
    const pv = f.ext === 'html' ? `<button class="file f-html" data-preview="${f.id}"><span style="font-size:26px">👀</span><span>Ver vista previa<small>Probá tu app acá</small></span></button>` : '';
    return dl + pv;
  }).join('') + '</div>';
}

function toBlob(f) {
  const bin = atob(f.b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: f.mime + (f.ext === 'html' ? ';charset=utf-8' : '') });
}

function downloadFile(id) {
  const f = fileStore[id];
  if (!f) return toast('No encontré el archivo, pedímelo de nuevo.');
  const url = URL.createObjectURL(toBlob(f));
  const a = document.createElement('a');
  a.href = url; a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ---------- API (con reintentos automáticos) ---------- */
async function callApi(messages, noTools) {
  const body = JSON.stringify({ messages, noTools });
  if (body.length > MAX_REQ) throw new Error('Lo que mandaste pesa demasiado para un solo envío (límite ~4 MB). Probá con menos archivos a la vez o más livianos.');
  let lastErr;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      const txt = await r.text();
      let j = null;
      try { j = JSON.parse(txt); } catch { /* respuesta que no es JSON */ }
      if (r.ok && j) return j;
      const retryable = (!j && r.status >= 500) || [502, 503, 504].includes(r.status);
      const msg = (j && j.error) || (r.status === 413 ? 'Los archivos pesan demasiado (máx. ~4 MB por envío).' : r.status === 504 ? 'La respuesta tardó demasiado.' : 'Error del servidor (' + r.status + ').');
      if (retryable && a < 2) { lastErr = new Error(msg); await sleep(1500 * (a + 1)); continue; }
      throw new Error(msg);
    } catch (e) {
      lastErr = e;
      if (e.name === 'TypeError' && a < 2) { await sleep(1500 * (a + 1)); continue; } // corte de internet: reintenta
      if (e.name === 'TypeError') throw new Error('No hay conexión a internet. Revisá tu señal y probá de nuevo.');
      throw e;
    }
  }
  throw lastErr;
}

function buildBlocks(items, question, startIndex = 1) {
  const blocks = [];
  let n = startIndex;
  for (const p of items) {
    if (p.kind === 'image') {
      blocks.push({ type: 'text', text: `Imagen ${n++}: ${p.name}` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.data } });
    } else if (p.kind === 'pdf') {
      blocks.push({ type: 'text', text: `PDF adjunto: ${p.name}` });
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.data }, title: p.name });
    } else {
      blocks.push({ type: 'text', text: `=== Archivo: ${p.name} ===\n${p.text}\n=== Fin de ${p.name} ===` });
    }
  }
  blocks.push({ type: 'text', text: question });
  return blocks;
}

// Después de responder, se sacan las imágenes/PDF pesados del historial para que los mensajes siguientes no superen el límite
function stripHeavy(msg) {
  msg.content = msg.content
    .filter((b) => b.type !== 'image' && b.type !== 'document')
    .map((b) => (b.type === 'text' && /^(Imagen \d+:|PDF adjunto:)/.test(b.text) ? { type: 'text', text: '[Imagen/PDF enviado antes y ya analizado] ' + b.text } : b));
}

// Agrupa imágenes en lotes por cantidad y por peso
function makeBatches(imgs) {
  const batches = []; let cur = []; let size = 0;
  for (const p of imgs) {
    if (cur.length && (cur.length >= BATCH_MAX || size + p.data.length > BATCH_CHARS)) { batches.push(cur); cur = []; size = 0; }
    cur.push(p); size += p.data.length;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/* ---------- enviar ---------- */
async function send() {
  if (busy) return;
  const text = input.value.trim();
  if (!text && !pending.length) return;
  const items = pending.slice();
  const question = text || 'Analizá en profundidad todo lo que te mandé y explicámelo de forma clara.';
  busy = true; sendBtn.disabled = true;
  input.value = ''; autosize();
  pending = []; renderPending();

  const imgs = items.filter((p) => p.kind === 'image');
  let uh = '';
  if (imgs.length) uh += '<div class="thumbs">' + imgs.slice(0, 12).map((p) => `<img src="${p.thumb}">`).join('') + (imgs.length > 12 ? `<span class="chip-file">+${imgs.length - 12} más</span>` : '') + '</div>';
  items.filter((p) => p.kind !== 'image').forEach((p) => { uh += `<div class="chip-file" style="display:inline-block;margin:0 4px 6px 0">${p.kind === 'pdf' ? '📄' : '📝'} ${esc(p.name)}</div>`; });
  uh += `<div>${esc(question).replace(/\n/g, '<br>')}</div>`;
  addMsg('user', uh);

  const bot = addMsg('bot', '<div class="typing"><i></i><i></i><i></i></div>');
  const startLen = history.length;
  try {
    let userBlocks;
    const imgChars = imgs.reduce((a, p) => a + p.data.length, 0);
    if (imgs.length > BATCH_MAX || imgChars > BATCH_CHARS) {
      // Muchas imágenes: se analizan por lotes y después se combinan los informes
      const others = items.filter((p) => p.kind !== 'image');
      const batches = makeBatches(imgs);
      bot.innerHTML = `<div>🔎 Estoy leyendo tus <b>${imgs.length}</b> imágenes en ${batches.length} lotes…</div><div class="progress"><b id="pb"></b></div><div id="pt" style="font-size:13px;color:#64748B;margin-top:4px"></div>`;
      const reports = [];
      let start = 1;
      for (let b = 0; b < batches.length; b++) {
        const end = start + batches[b].length - 1;
        const prompt = `Este es el lote ${b + 1} de ${batches.length} (imágenes ${start} a ${end}). Pedido final del usuario: "${question}"\nDescribí y transcribí con precisión TODO lo relevante de cada imagen para ese pedido (texto visible, números, nombres, fechas, objetos). Citá siempre el número de imagen. No inventes nada; si algo no se lee, decilo.`;
        const out = await callApi([{ role: 'user', content: buildBlocks(batches[b], prompt, start) }], true);
        reports.push(`### Informe del lote ${b + 1} (imágenes ${start}-${end})\n${out.text}`);
        start = end + 1;
        const pb = $('#pb'), pt = $('#pt');
        if (pb) pb.style.width = Math.round(((b + 1) / batches.length) * 100) + '%';
        if (pt) pt.textContent = `Lote ${b + 1} de ${batches.length} listo`;
      }
      const combined = `Subí ${imgs.length} imágenes que ya fueron analizadas por lotes. Estos son los informes de análisis:\n\n${reports.join('\n\n')}`;
      userBlocks = buildBlocks(others, combined + `\n\nPEDIDO DEL USUARIO: ${question}\nRespondé usando únicamente estos informes y los archivos, citando números de imagen.`);
    } else {
      userBlocks = buildBlocks(items, question);
    }
    const userMsg = { role: 'user', content: userBlocks };
    history.push(userMsg);
    const out = await callApi(history, false);
    stripHeavy(userMsg);
    history.push({ role: 'assistant', content: [{ type: 'text', text: out.text + (out.files && out.files.length ? `\n[Archivos generados: ${out.files.map((f) => f.name).join(', ')}]` : '') }] });
    bot.innerHTML = md(out.text) + filesHtml(out.files);
  } catch (e) {
    history.length = startLen; // se deshace el mensaje que falló
    bot.innerHTML = `<p>😕 Uy, algo salió mal: <b>${esc(e.message || 'error inesperado')}</b></p><p>No perdiste nada: probá de nuevo cuando quieras.</p>`;
  } finally {
    busy = false; sendBtn.disabled = false;
    scrollDown(); input.focus();
  }
}

/* ---------- eventos ---------- */
function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; }
input.addEventListener('input', autosize);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !/Mobi|Android/i.test(navigator.userAgent)) { e.preventDefault(); send(); } });
sendBtn.onclick = send;
$('#attach').onclick = () => fileInput.click();
fileInput.onchange = () => { addFiles(fileInput.files); fileInput.value = ''; };
$('#newchat').onclick = () => location.reload();

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-p]');
  if (c) { input.value = c.dataset.p; input.focus(); autosize(); return; }
  if (e.target.closest('[data-attach]')) { fileInput.click(); return; }
  const dl = e.target.closest('[data-dl]');
  if (dl) { downloadFile(dl.dataset.dl); return; }
  const pv = e.target.closest('[data-preview]');
  if (pv) openPreview(pv.dataset.preview);
});

// pegar imágenes con Ctrl+V
document.addEventListener('paste', (e) => {
  const fs = [...((e.clipboardData && e.clipboardData.files) || [])];
  if (fs.length) { e.preventDefault(); addFiles(fs); }
});

// arrastrar y soltar
let dragN = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragN++; $('#drop').classList.add('on'); });
window.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('#drop').classList.remove('on'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); dragN = 0; $('#drop').classList.remove('on'); addFiles(e.dataTransfer.files); });

/* ---------- vista previa de apps ---------- */
let previewUrl = null;
function openPreview(id) {
  const f = fileStore[id];
  if (!f) return toast('No encontré la app, pedímela de nuevo.');
  const bin = atob(f.b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  $('#mtitle').textContent = '🧩 ' + (f.title || f.name);
  $('#mframe').srcdoc = new TextDecoder().decode(bytes);
  $('#mopen').onclick = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(toBlob(f)); window.open(previewUrl, '_blank'); };
  $('#modal').classList.add('on');
}
$('#mclose').onclick = () => { $('#modal').classList.remove('on'); $('#mframe').srcdoc = ''; };

/* ---------- instalar en el celular (PWA) ---------- */
let deferredPrompt = null;
const installBtn = $('#install');
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (!standalone) installBtn.hidden = false;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
window.addEventListener('appinstalled', () => { installBtn.hidden = true; toast('¡Salita IA instalada! 🎉'); });
installBtn.onclick = async () => {
  if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; return; }
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  alert(ios
    ? 'Para instalarla en tu iPhone:\n1) Tocá el botón Compartir (cuadrado con flecha)\n2) Elegí "Agregar a pantalla de inicio"'
    : 'Para instalarla:\nabrí el menú del navegador (⋮) y tocá "Instalar app" o "Agregar a pantalla de inicio".');
};
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

/* ---------- que nunca se quede trabada ---------- */
window.addEventListener('error', () => { toast('Ups, algo falló. Probá de nuevo 🙏'); });
window.addEventListener('unhandledrejection', (e) => { e.preventDefault(); toast('Ups, algo falló. Probá de nuevo 🙏'); if (busy) { busy = false; sendBtn.disabled = false; } });

// aviso si falta la clave
fetch('/api/status').then((r) => r.json()).then((s) => {
  if (!s.keyConfigured) notice('Falta configurar la clave de la IA. Mirá el README.');
}).catch(() => {});
