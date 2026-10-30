# Salita IA 💙

Asistente con IA que lee imágenes, PDF, Word y Excel, y crea PDF, Word, PowerPoint, Excel y apps web.
Se instala en el celular como una app (PWA).

## Publicar en Vercel (queda fija y con link propio)
1. Creá una cuenta gratis en https://github.com y subí esta carpeta como repositorio nuevo.
2. Entrá a https://vercel.com con tu cuenta de GitHub → "Add New… → Project" → elegí el repositorio → Deploy.
3. En el proyecto de Vercel: Settings → Environment Variables → agregá
   `SALITA_API_KEY` = tu clave de Google AI Studio. Agregá también `SALITA_PROVIDER` = `gemini` y, opcionalmente, `SALITA_MODEL` = `gemini-2.5-flash`; después Deployments → "Redeploy".
4. Abrí el link que te da Vercel (por ejemplo salita-ia.vercel.app).

No pongas la clave dentro del código ni la subas a GitHub. Configurala como variable de entorno local o como secreto en Vercel.

Para usar Anthropic en lugar de Gemini, configurá `SALITA_PROVIDER` = `anthropic` y `ANTHROPIC_API_KEY` = tu clave de console.anthropic.com.

Si Vercel se queja de `maxDuration`, bajá 300 a 60 en `vercel.json`.

## Instalarla en el celular
- Android (Chrome): abrí el link → botón "📲 Instalar" → Instalar.
- iPhone (Safari): abrí el link → Compartir → "Agregar a pantalla de inicio".

## Probar en tu compu
1. Node.js 18+ → `npm install`
2. `npm test` crea PDF/Word/PowerPoint/Excel de ejemplo en `out/` (no necesita clave).
3. `SALITA_API_KEY=tu_clave npm start` → http://localhost:3000 (o usá `ANTHROPIC_API_KEY=tu_clave npm start` para Anthropic).

## Tu logo original
Poné tu imagen como `public/logo.png` (la app la usa en lugar de `logo.svg`).

## Límites a tener en cuenta
- Vercel acepta ~4.5 MB por envío: las fotos se comprimen solas y, si son muchas, se leen por lotes con barra de progreso. Los PDF/Word/Excel deben pesar menos de ~3 MB cada uno.
- Después de analizar fotos o PDF, la IA recuerda su análisis, pero no vuelve a ver el archivo original: si necesitás más detalle, reenviálo.
- Los archivos generados se descargan al instante; no se guardan en el servidor.
