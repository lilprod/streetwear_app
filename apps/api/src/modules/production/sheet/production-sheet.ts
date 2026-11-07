import PDFDocument from 'pdfkit';
import { formatLome } from '@streetwear/shared';
import { code128Modules } from './code128';

export interface SheetItem {
  index: number;
  colorName: string;
  colorHex: string;
  size: string;
  quantity: number;
  /** Aperçus PNG déjà recomposés sur la couleur du t-shirt ; absents = indisponibles. */
  front?: Buffer;
  back?: Buffer;
  hasFront: boolean;
  hasBack: boolean;
}

export interface SheetData {
  number: string;
  createdAt: Date;
  promisedAt: Date | null;
  receptionLabel: string;
  operatorLabel: string | null;
  items: SheetItem[];
}

const MARGIN = 40;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const PREVIEW_W = 230;
const PREVIEW_H = 260;

function drawBarcode(doc: PDFKit.PDFDocument, text: string, x: number, y: number, height: number) {
  const modules = code128Modules(text);
  const moduleW = 1.2;
  let i = 0;
  while (i < modules.length) {
    if (!modules[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < modules.length && modules[j]) j++;
    doc.rect(x + i * moduleW, y, (j - i) * moduleW, height).fill('#000000');
    i = j;
  }
  return modules.length * moduleW;
}

export function renderProductionSheet(data: SheetData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: { Title: `Fiche de production ${data.number}` },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor('#000')
    .text('Fiche de production', MARGIN, MARGIN);
  doc.fontSize(14).text(data.number);
  const barcodeW = code128Modules(data.number).length * 1.2;
  drawBarcode(doc, data.number, PAGE_W - MARGIN - barcodeW, MARGIN, 40);
  doc
    .font('Helvetica')
    .fontSize(8)
    .text(data.number, PAGE_W - MARGIN - barcodeW, MARGIN + 43, {
      width: barcodeW,
      align: 'center',
    });

  doc.moveDown(0.8).font('Helvetica').fontSize(10);
  const y0 = 100;
  doc.text(`Commande passée le : ${formatLome(data.createdAt)}`, MARGIN, y0);
  doc.text(`Date promise : ${data.promisedAt ? formatLome(data.promisedAt) : 'à définir'}`);
  doc.text(`Réception : ${data.receptionLabel}`);
  doc.text(`Opérateur : ${data.operatorLabel ?? 'non affecté'}`);

  let y = 180;
  for (const item of data.items) {
    if (y + PREVIEW_H + 60 > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
    doc.text(
      `Ligne ${item.index} — couleur ${item.colorName} — taille ${item.size} — quantité ${item.quantity}`,
      MARGIN,
      y,
    );
    y += 20;
    const boxes: [string, Buffer | undefined, boolean, number][] = [
      ['Devant', item.front, item.hasFront, MARGIN],
      ['Dos', item.back, item.hasBack, MARGIN + PREVIEW_W + 25],
    ];
    for (const [label, img, wanted, x] of boxes) {
      doc.rect(x, y, PREVIEW_W, PREVIEW_H).lineWidth(0.5).stroke('#888888');
      doc.font('Helvetica').fontSize(9).fillColor('#000');
      if (!wanted) {
        doc.text(`${label} : aucun motif`, x + 8, y + PREVIEW_H / 2, {
          width: PREVIEW_W - 16,
          align: 'center',
        });
      } else if (!img) {
        doc.text(`${label} : aperçu indisponible`, x + 8, y + PREVIEW_H / 2, {
          width: PREVIEW_W - 16,
          align: 'center',
        });
      } else {
        doc.image(img, x + 4, y + 4, {
          fit: [PREVIEW_W - 8, PREVIEW_H - 8],
          align: 'center',
          valign: 'center',
        });
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(label, x, y + PREVIEW_H + 4, { width: PREVIEW_W, align: 'center' });
    }
    y += PREVIEW_H + 30;
  }

  if (y + 90 > PAGE_H - MARGIN) {
    doc.addPage();
    y = MARGIN;
  }
  const bySize = new Map<string, number>();
  for (const i of data.items) bySize.set(i.size, (bySize.get(i.size) ?? 0) + i.quantity);
  const total = [...bySize.values()].reduce((a, b) => a + b, 0);
  doc.font('Helvetica-Bold').fontSize(11).text('Récapitulatif tailles et quantités', MARGIN, y);
  doc.font('Helvetica').fontSize(10);
  doc.text(
    [...bySize].map(([s, q]) => `${s} × ${q}`).join('    ') + `    —    Total : ${total} pièce(s)`,
  );

  doc.end();
  return done;
}
