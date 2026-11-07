import PDFDocument from 'pdfkit';
import { formatLome, formatTgPhone, formatXof, ORDER_STATUS_LABELS_FR } from '@streetwear/shared';
import type { Order, OrderItem, OrderStatusHistory, User } from '@prisma/client';

type ReceiptOrder = Order & { items: OrderItem[]; history: OrderStatusHistory[]; user: User };

/** Les polices standard PDF (WinAnsi) n'ont pas l'espace fine insécable : espace insécable classique. */
const xof = (n: number): string => formatXof(n).replace(/\u202f/g, '\u00a0');

const PAYMENT_LABELS: Record<string, string> = {
  tmoney: 'T-Money',
  flooz: 'Flooz',
  card: 'Carte bancaire',
  cod: 'Paiement à la livraison (acompte)',
};

/** Mentions légales : valeurs à fournir par la marque (placeholders tant qu'elles manquent). */
const LEGAL = [
  '[Raison sociale] — [Adresse du siège], Lomé, Togo',
  'RCCM : [à compléter] — NIF : [à compléter]',
  'Prix toutes taxes comprises (TVA 18 % incluse). Document tenant lieu de reçu.',
];

export function renderReceipt(order: ReceiptOrder): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Reçu ${order.number}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const paidAt =
    order.history.find((h) => h.toStatus === 'paid' || h.toStatus === 'deposit_paid')?.createdAt ??
    order.createdAt;
  doc.fontSize(20).text('Reçu de commande', { align: 'left' });
  doc.moveDown(0.5).fontSize(11);
  doc.text(`Commande : ${order.number}`);
  doc.text(`Date de commande : ${formatLome(order.createdAt)}`);
  doc.text(`Date de paiement : ${formatLome(paidAt)}`);
  doc.text(`Statut : ${ORDER_STATUS_LABELS_FR[order.status]}`);
  doc.text(`Client : ${order.user.name ?? 'Client'}`);
  if (order.user.phone) doc.text(`Téléphone : ${formatTgPhone(order.user.phone)}`);
  doc.text(`Moyen de paiement : ${PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}`);
  doc.text(
    `Réception : ${order.receptionType === 'home' ? 'Livraison à domicile' : 'Retrait en boutique'}`,
  );

  doc.moveDown().fontSize(12).text('Articles', { underline: true }).fontSize(11);
  order.items.forEach((i, n) => {
    doc.text(
      `${n + 1}. T-shirt personnalisé — taille ${i.size} — ${i.quantity} × ${xof(i.unitPriceXof)} = ${xof(i.unitPriceXof * i.quantity)}`,
    );
  });

  doc.moveDown();
  doc.text(`Sous-total : ${xof(order.subtotalXof)}`);
  doc.text(`Frais de livraison : ${xof(order.deliveryFeeXof)}`);
  doc
    .fontSize(13)
    .text(`Total TTC : ${xof(order.totalXof)}`)
    .fontSize(11);
  doc.text(`dont TVA (18 %) : ${xof(order.vatIncludedXof)}`);
  if (order.depositXof !== null) {
    doc.text(`Acompte payé : ${xof(order.depositXof)}`);
    doc.text(`Solde à payer à la réception : ${xof(order.totalXof - order.depositXof)}`);
  }

  doc.moveDown(2).fontSize(9).fillColor('#555555');
  for (const line of LEGAL) doc.text(line);
  doc.end();
  return done;
}
