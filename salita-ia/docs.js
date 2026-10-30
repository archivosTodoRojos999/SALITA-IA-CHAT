// Generadores de documentos profesionales y coloridos para Salita IA
import PDFDocument from 'pdfkit';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, BorderStyle
} from 'docx';
import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';

const NAVY = '0B1F5C';
const CYAN = '06B6D4';
const PALETTE = ['06B6D4', '7C3AED', 'EC4899', 'F59E0B', '10B981', '3B82F6'];
const col = (i) => PALETTE[i % PALETTE.length];

const str = (v) => (v === null || v === undefined ? '' : String(v));
const secs = (d) => (Array.isArray(d.sections) ? d.sections : []);

/* ------------------------------ PDF ------------------------------ */
export function buildPdf(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const left = 50;
    const width = W - 100;

    // Portada / encabezado
    doc.rect(0, 0, W, 120).fill('#' + NAVY);
    doc.rect(0, 120, W, 6).fill('#' + CYAN);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(26).text(str(d.title), left, 36, { width });
    if (d.subtitle) {
      doc.font('Helvetica').fontSize(13).fillColor('#BAE6FD').text(str(d.subtitle), left, doc.y + 4, { width });
    }
    doc.x = left;
    doc.y = 150;

    const ensure = (h) => {
      if (doc.y + h > doc.page.height - 70) {
        doc.addPage();
        doc.x = left;
        doc.y = 50;
      }
    };

    secs(d).forEach((s, i) => {
      const c = '#' + col(i);
      ensure(60);
      doc.moveDown(0.6);
      doc.x = left;
      if (s.heading) {
        doc.fillColor(c).font('Helvetica-Bold').fontSize(16).text(str(s.heading), left, doc.y, { width });
        const ly = doc.y + 2;
        doc.moveTo(left, ly).lineTo(left + 70, ly).lineWidth(3).strokeColor(c).stroke();
        doc.y = ly + 10;
      }
      doc.x = left;
      if (s.text) {
        doc.fillColor('#1F2937').font('Helvetica').fontSize(11);
        const h = doc.heightOfString(str(s.text), { width, lineGap: 3 });
        ensure(Math.min(h, 120));
        doc.text(str(s.text), left, doc.y, { width, lineGap: 3, align: 'left' });
        doc.moveDown(0.5);
      }
      (Array.isArray(s.bullets) ? s.bullets : []).forEach((b) => {
        const h = doc.heightOfString(str(b), { width: width - 20, lineGap: 2 });
        ensure(h + 6);
        const y = doc.y;
        doc.circle(left + 5, y + 6, 2.5).fill(c);
        doc.fillColor('#1F2937').font('Helvetica').fontSize(11).text(str(b), left + 18, y, { width: width - 18, lineGap: 2 });
        doc.moveDown(0.25);
      });
      if (s.table && Array.isArray(s.table.headers)) {
        const headers = s.table.headers;
        const rows = Array.isArray(s.table.rows) ? s.table.rows : [];
        const cw = width / headers.length;
        const drawRow = (cells, isHead, zebra) => {
          doc.font(isHead ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
          const hs = cells.map((x) => doc.heightOfString(str(x), { width: cw - 12 }));
          const rh = Math.max(...hs) + 12;
          ensure(rh);
          const y = doc.y;
          if (isHead) doc.rect(left, y, width, rh).fill(c);
          else if (zebra) doc.rect(left, y, width, rh).fill('#F1F5F9');
          cells.forEach((x, k) => {
            doc.fillColor(isHead ? '#FFFFFF' : '#1F2937').text(str(x), left + k * cw + 6, y + 6, { width: cw - 12 });
          });
          doc.y = y + rh;
        };
        doc.moveDown(0.3);
        drawRow(headers, true, false);
        rows.forEach((r, k) => drawRow(headers.map((_, j) => (r || [])[j]), false, k % 2 === 0));
        doc.x = left;
        doc.moveDown(0.5);
      }
    });

    // Pie de página con numeración
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.rect(0, doc.page.height - 30, W, 30).fill('#F1F5F9');
      doc.fillColor('#64748B').font('Helvetica').fontSize(9)
        .text(`Salita IA  ·  Página ${i + 1} de ${range.count}`, left, doc.page.height - 20, { width, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

/* ------------------------------ WORD ------------------------------ */
export async function buildDocx(d) {
  const children = [];
  children.push(new Paragraph({
    children: [new TextRun({ text: str(d.title), bold: true, size: 52, color: NAVY })],
    spacing: { after: 120 }
  }));
  if (d.subtitle) {
    children.push(new Paragraph({
      children: [new TextRun({ text: str(d.subtitle), size: 28, color: CYAN })],
      spacing: { after: 300 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: CYAN, space: 6 } }
    }));
  }
  secs(d).forEach((s, i) => {
    const c = col(i);
    if (s.heading) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: str(s.heading), bold: true, size: 32, color: c })],
        spacing: { before: 300, after: 120 }
      }));
    }
    if (s.text) {
      str(s.text).split(/\n+/).forEach((p) =>
        children.push(new Paragraph({ children: [new TextRun({ text: p, size: 22 })], spacing: { after: 120 }, alignment: AlignmentType.LEFT })));
    }
    (Array.isArray(s.bullets) ? s.bullets : []).forEach((b) =>
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: str(b), size: 22 })], spacing: { after: 60 } })));
    if (s.table && Array.isArray(s.table.headers)) {
      const headers = s.table.headers;
      const rows = Array.isArray(s.table.rows) ? s.table.rows : [];
      const cell = (t, head, zebra) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: str(t), bold: head, color: head ? 'FFFFFF' : '1F2937', size: 20 })] })],
        shading: head ? { type: ShadingType.CLEAR, fill: c, color: 'auto' } : zebra ? { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 }
      });
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: headers.map((h) => cell(h, true, false)) }),
          ...rows.map((r, k) => new TableRow({ children: headers.map((_, j) => cell((r || [])[j], false, k % 2 === 0)) }))
        ]
      }));
      children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
    }
  });
  const doc = new Document({
    creator: 'Salita IA',
    title: str(d.title),
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ children }]
  });
  return Packer.toBuffer(doc);
}

/* ------------------------------ POWERPOINT ------------------------------ */
export async function buildPptx(d) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
  pres.author = 'Salita IA';
  pres.title = str(d.title);

  const cover = pres.addSlide();
  cover.background = { color: NAVY };
  cover.addShape(pres.ShapeType.rect, { x: 0, y: 5.2, w: 13.33, h: 0.25, fill: { color: CYAN } });
  cover.addShape(pres.ShapeType.ellipse, { x: 10.2, y: -1.2, w: 4.5, h: 4.5, fill: { color: '7C3AED', transparency: 55 } });
  cover.addShape(pres.ShapeType.ellipse, { x: 11.3, y: 4.2, w: 3.2, h: 3.2, fill: { color: 'EC4899', transparency: 60 } });
  cover.addText(str(d.title), { x: 0.8, y: 2.0, w: 10.5, h: 1.6, fontSize: 44, bold: true, color: 'FFFFFF', fontFace: 'Calibri' });
  if (d.subtitle) cover.addText(str(d.subtitle), { x: 0.8, y: 3.7, w: 10.5, h: 0.8, fontSize: 22, color: 'BAE6FD', fontFace: 'Calibri' });

  secs(d).forEach((s, i) => {
    const c = col(i);
    const slide = pres.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: c } });
    slide.addText(str(s.heading), { x: 0.6, y: 0.15, w: 12, h: 0.8, fontSize: 30, bold: true, color: 'FFFFFF', fontFace: 'Calibri' });
    let y = 1.5;
    if (s.text) {
      const h = s.bullets || s.table ? 1.3 : 4.5;
      slide.addText(str(s.text), { x: 0.6, y, w: 12.1, h, fontSize: 20, color: '1F2937', valign: 'top', fontFace: 'Calibri' });
      y += h + 0.1;
    }
    if (Array.isArray(s.bullets) && s.bullets.length) {
      const h = s.table ? 2.2 : 5.5 - (y - 1.5);
      slide.addText(
        s.bullets.map((b) => ({ text: str(b), options: { bullet: { code: '25CF', color: c }, breakLine: true } })),
        { x: 0.6, y, w: 12.1, h, fontSize: 22, color: '1F2937', valign: 'top', paraSpaceAfter: 8, fontFace: 'Calibri' }
      );
      y += h + 0.1;
    }
    if (s.table && Array.isArray(s.table.headers)) {
      const head = s.table.headers.map((h) => ({ text: str(h), options: { bold: true, color: 'FFFFFF', fill: { color: c } } }));
      const rows = (Array.isArray(s.table.rows) ? s.table.rows : []).map((r, k) =>
        s.table.headers.map((_, j) => ({ text: str((r || [])[j]), options: { fill: { color: k % 2 === 0 ? 'F1F5F9' : 'FFFFFF' } } })));
      slide.addTable([head, ...rows], { x: 0.6, y, w: 12.1, fontSize: 14, color: '1F2937', border: { type: 'solid', color: 'CBD5E1', pt: 0.5 } });
    }
    slide.addText('Salita IA', { x: 11.3, y: 7.0, w: 1.8, h: 0.3, fontSize: 10, color: '94A3B8', align: 'right' });
  });
  return pres.write({ outputType: 'nodebuffer' });
}

/* ------------------------------ EXCEL ------------------------------ */
export async function buildXlsx(d) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Salita IA';
  let sheets = Array.isArray(d.sheets) ? d.sheets : [];
  if (!sheets.length) {
    sheets = secs(d).filter((s) => s.table && Array.isArray(s.table.headers))
      .map((s) => ({ name: s.heading || 'Hoja', headers: s.table.headers, rows: s.table.rows || [] }));
  }
  if (!sheets.length) {
    sheets = [{ name: 'Datos', headers: ['Sección', 'Contenido'], rows: secs(d).map((s) => [s.heading || '', [s.text, ...(s.bullets || [])].filter(Boolean).join('\n')]) }];
  }
  sheets.forEach((sh, i) => {
    const name = str(sh.name || `Hoja ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const headers = Array.isArray(sh.headers) ? sh.headers : [];
    const hr = ws.addRow(headers);
    hr.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + col(i) } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    hr.height = 24;
    (Array.isArray(sh.rows) ? sh.rows : []).forEach((r, k) => {
      const row = ws.addRow((r || []).map((v) => (typeof v === 'string' && v.startsWith('=') ? { formula: v.slice(1) } : v)));
      if (k % 2 === 0) row.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; });
      row.alignment = { wrapText: true, vertical: 'top' };
    });
    ws.columns.forEach((c, idx) => {
      let max = str(headers[idx]).length;
      c.eachCell({ includeEmpty: false }, (cell) => { max = Math.max(max, str(cell.value && cell.value.formula ? '0000000000' : cell.value).length); });
      c.width = Math.min(Math.max(max + 4, 12), 60);
    });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
