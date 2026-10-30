// Prueba rápida de los generadores (no necesita clave de API)
import fs from 'node:fs';
import { buildPdf, buildDocx, buildPptx, buildXlsx } from './docs.js';

const d = {
  title: 'Informe de prueba áéíóú ñ ¿?',
  subtitle: 'Generado por Salita IA',
  sections: [
    { heading: 'Introducción', text: 'Este es un párrafo de prueba.\n'.repeat(6), bullets: ['Primer punto', 'Segundo punto', 'Tercer punto'] },
    { heading: 'Ventas', table: { headers: ['Mes', 'Ventas', 'Meta'], rows: [['Enero', 100, 90], ['Febrero', 120, 110], ['Marzo', 90, 100]] } },
    { heading: 'Conclusión', text: 'Todo funciona.', bullets: ['Listo'] }
  ],
  sheets: [{ name: 'Ventas', headers: ['Mes', 'Ventas', 'Meta', 'Diferencia'], rows: [['Enero', 100, 90, '=B2-C2'], ['Febrero', 120, 110, '=B3-C3']] }]
};
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/test.pdf', await buildPdf(d));
fs.writeFileSync('out/test.docx', await buildDocx(d));
fs.writeFileSync('out/test.pptx', await buildPptx(d));
fs.writeFileSync('out/test.xlsx', await buildXlsx(d));
console.log('OK: out/test.pdf, .docx, .pptx, .xlsx');
