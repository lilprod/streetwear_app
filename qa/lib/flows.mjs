import { fileURLToPath } from 'node:url';
import {
  fillCart,
  makeSlot,
  pay,
  placeOrder,
  sqlOne,
  STORE_ID,
  customers,
  setStock,
} from './harness.mjs';

/** Prépare un client avec un panier (colorId/size/qty) et crée une commande retrait sur un créneau. */
export async function orderForNewCustomer({
  colorId = 'col-blanc',
  size = 'L',
  qty = 1,
  slotId,
  paymentMethod = 'tmoney',
} = {}) {
  const [c] = await customers(1);
  await fillCart(c.token, { colorId, size, qty });
  const slot = slotId ?? makeSlot(50);
  const r = await placeOrder(c.token, {
    reception: { type: 'pickup', storeId: STORE_ID(), slotId: slot },
    paymentMethod,
  });
  if (r.status !== 201) throw new Error(`order: ${r.status} ${r.text}`);
  return { c, orderId: r.body.id, number: r.body.number, totalXof: r.body.totalXof, slot };
}

/** Commande + paiement initié ; renvoie la référence agrégateur lue en base. */
export async function paidFlowStart(opts = {}) {
  const o = await orderForNewCustomer(opts);
  const p = await pay(o.c.token, o.orderId, {
    payerPhone: opts.payerPhone ?? '+22890000011',
    method: opts.method ?? 'tmoney',
  });
  if (p.status !== 201) throw new Error(`payment: ${p.status} ${p.text}`);
  const ref = sqlOne(`SELECT provider_ref FROM payments WHERE id='${p.body.paymentId}'`);
  return { ...o, paymentId: p.body.paymentId, ref, amount: p.body.amountXof };
}

export const orderStatus = (id) => sqlOne(`SELECT status FROM orders WHERE id='${id}'`);
export const stockRow = (c, s) =>
  sqlOne(`SELECT on_hand||'/'||reserved FROM stock_items WHERE color_id='${c}' AND size='${s}'`);
export { setStock };

/** Exécute `fn` si le fichier est lancé directement (`node coherence/01-stock.mjs`) ; code de sortie 1 si échec. */
export async function runIfMain(metaUrl, fn) {
  if (process.argv[1] !== fileURLToPath(metaUrl)) return;
  const results = await fn();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
