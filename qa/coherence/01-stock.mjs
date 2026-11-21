// C-STOCK : concurrence sur le stock (jamais de survente, jamais de stock négatif).
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

async function race({ n, stock, wants, colorId, size }) {
  setStock(colorId, size, stock, 0);
  const cs = await customers(n);
  const slot = makeSlot(1000);
  await Promise.all(cs.map((c, i) => fillCart(c.token, { colorId, size, qty: wants(i) })));
  const reception = { type: 'pickup', storeId: STORE_ID(), slotId: slot };
  const res = await Promise.all(cs.map((c) => placeOrder(c.token, { reception })));
  return { cs, res, slot };
}

export async function run() {
  const out = [];

  // 1. N clients, 1 unité restante, 1 article chacun
  const s1 = new Scenario(
    'C-STOCK-1',
    '20 clients achètent en même temps la dernière unité (terracotta, S)',
  );
  {
    const { res, cs } = await race({
      n: 20,
      stock: 1,
      wants: () => 1,
      colorId: 'col-terracotta',
      size: 'S',
    });
    const by = countBy(res, (r) => r.status);
    s1.expect('une seule commande créée (201)', 1, by[201] ?? 0);
    s1.expect('toutes les autres refusées (409)', 19, by[409] ?? 0);
    s1.expect(
      'code des refus',
      ['OUT_OF_STOCK'],
      [...new Set(res.filter((r) => r.status === 409).map((r) => r.body?.error?.code))],
    );
    const ids = cs.map((c) => `'${c.userId}'`).join(',');
    const [[row]] = s1
      .control(
        'stock après la course',
        `SELECT on_hand, reserved, on_hand - reserved AS dispo FROM stock_items WHERE color_id='col-terracotta' AND size='S'`,
      )
      .map((r) => [r]);
    s1.expect('on_hand=1, reserved=1, dispo=0', ['1', '1', '0'], row);
    s1.expect(
      'commandes en attente de ces clients',
      ['1'],
      s1.control('commandes créées', `SELECT count(*) FROM orders WHERE user_id IN (${ids})`)[0],
    );
    s1.expect(
      'mouvements reserve = 1 unité, aucun autre',
      ['reserve', '1'],
      s1.control(
        'mouvements',
        `SELECT m.type, sum(m.quantity) FROM stock_movements m JOIN stock_items i ON i.id=m.stock_item_id JOIN orders o ON o.id=m.order_id WHERE i.color_id='col-terracotta' AND i.size='S' AND o.user_id IN (${ids}) GROUP BY m.type`,
      )[0],
    );
  }
  out.push(s1.finish('coherence-stock-1.json'));

  // 2. Demande mixte (quantités 1 à 3) pour un stock de 5
  const s2 = new Scenario('C-STOCK-2', '12 clients (quantités 1 à 3) pour 5 unités (indigo, XL)');
  {
    const wants = (i) => (i % 3) + 1;
    const { res, cs } = await race({ n: 12, stock: 5, wants, colorId: 'col-indigo', size: 'XL' });
    const okQty = res.reduce((s, r, i) => s + (r.status === 201 ? wants(i) : 0), 0);
    s2.expectTrue('somme des quantités acceptées <= 5', okQty <= 5, `acceptées ${okQty}`);
    s2.expect(
      'aucune réponse inattendue',
      [],
      res.filter((r) => ![201, 409].includes(r.status)).map((r) => r.status),
    );
    const ids = cs.map((c) => `'${c.userId}'`).join(',');
    const rows = s2.control(
      'stock',
      `SELECT on_hand, reserved FROM stock_items WHERE color_id='col-indigo' AND size='XL'`,
    );
    s2.expect('reserved = quantités acceptées', String(okQty), rows[0][1]);
    s2.expect('on_hand inchangé', '5', rows[0][0]);
    s2.expect(
      'somme order_items des commandes créées = reserved',
      String(okQty),
      s2.control(
        'lignes',
        `SELECT coalesce(sum(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id IN (${ids})`,
      )[0][0],
    );
    s2.expect(
      'jamais de stock négatif ni réservé > disponible',
      [],
      s2.control(
        'violations',
        `SELECT id FROM stock_items WHERE on_hand < 0 OR reserved < 0 OR reserved > on_hand`,
      ),
    );
  }
  out.push(s2.finish('coherence-stock-2.json'));

  // 3. Rejeu de la même commande (même clé) en parallèle : une seule réservation
  const s3 = new Scenario(
    'C-STOCK-3',
    'Même Idempotency-Key ×5 en parallèle : une commande, une réservation',
  );
  {
    setStock('col-sable', 'M', 10, 0);
    const [c] = await customers(1);
    await fillCart(c.token, { colorId: 'col-sable', size: 'M', qty: 2 });
    const slot = makeSlot(10);
    const key = crypto.randomUUID();
    const res = await Promise.all(
      Array.from({ length: 5 }, () =>
        placeOrder(c.token, {
          reception: { type: 'pickup', storeId: STORE_ID(), slotId: slot },
          key,
        }),
      ),
    );
    s3.expect(
      'statuts',
      [201, 201, 201, 201, 201].length,
      res.filter((r) => r.status === 201 || r.status === 200).length,
    );
    s3.expect('un seul identifiant de commande', 1, new Set(res.map((r) => r.body?.id)).size);
    s3.expect(
      'reserved = 2 (pas 10)',
      '2',
      s3.control(
        'stock',
        `SELECT reserved FROM stock_items WHERE color_id='col-sable' AND size='M'`,
      )[0][0],
    );
    s3.expect(
      'créneau réservé une fois',
      '1',
      s3.control('créneau', `SELECT booked FROM pickup_slots WHERE id='${slot}'`)[0][0],
    );
  }
  out.push(s3.finish('coherence-stock-3.json'));
  return out;
}
await runIfMain(import.meta.url, run);
