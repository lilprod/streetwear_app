// C-SLOT : concurrence sur les créneaux de retrait (capacité jamais dépassée).
import {
  Scenario,
  countBy,
  customers,
  fillCart,
  makeSlot,
  placeOrder,
  setStock,
  STORE_ID,
} from '../lib/harness.mjs';
import { runIfMain } from '../lib/flows.mjs';

export async function run() {
  const out = [];
  const s = new Scenario('C-SLOT-1', '15 clients se disputent un créneau de capacité 3');
  setStock('col-blanc', 'XS', 100, 0);
  const slot = makeSlot(3);
  const cs = await customers(15);
  await Promise.all(cs.map((c) => fillCart(c.token, { colorId: 'col-blanc', size: 'XS', qty: 1 })));
  const reception = { type: 'pickup', storeId: STORE_ID(), slotId: slot };
  const res = await Promise.all(cs.map((c) => placeOrder(c.token, { reception })));
  const by = countBy(res, (r) => r.status);
  s.expect('3 commandes créées', 3, by[201] ?? 0);
  s.expect('12 refus', 12, by[409] ?? 0);
  s.expect(
    'code des refus',
    ['SLOT_FULL'],
    [...new Set(res.filter((r) => r.status === 409).map((r) => r.body?.error?.code))],
  );
  s.expect(
    'booked = capacity = 3',
    ['3', '3'],
    s.control('créneau', `SELECT booked, capacity FROM pickup_slots WHERE id='${slot}'`)[0],
  );
  s.expect(
    '3 retraits enregistrés',
    '3',
    s.control('pickups', `SELECT count(*) FROM pickups WHERE slot_id='${slot}'`)[0][0],
  );
  const ids = cs.map((c) => `'${c.userId}'`).join(',');
  s.expect(
    'les 12 refus n’ont laissé aucune réservation de stock',
    '3',
    s.control(
      'réservé',
      `SELECT coalesce(sum(m.quantity),0) FROM stock_movements m JOIN orders o ON o.id=m.order_id WHERE m.type='reserve' AND o.user_id IN (${ids})`,
    )[0][0],
  );
  s.expect(
    'aucune commande orpheline des clients refusés',
    '3',
    s.control('commandes', `SELECT count(*) FROM orders WHERE user_id IN (${ids})`)[0][0],
  );
  s.expect(
    'aucun créneau en surcapacité',
    [],
    s.control('surcapacité', `SELECT id FROM pickup_slots WHERE booked > capacity OR booked < 0`),
  );
  out.push(s.finish('coherence-slots-1.json'));
  return out;
}
await runIfMain(import.meta.url, run);
