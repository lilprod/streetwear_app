// C-EXP : expiration (worker orders-expire réel), libération du stock et du créneau, succès tardif.
// Le job du worker tourne toutes les minutes. Le réglage order_expiry_minutes est ramené à 5 (minimum accepté par l'API) ;
// pour ne pas attendre 5 minutes, expires_at est ensuite avancé en SQL (accélération de test, signalée dans le rapport).
// REAL_WAIT=1 supprime cette accélération (attente réelle ~5 min).
import {
  Scenario,
  adminLogin,
  fillCart,
  http,
  makeSlot,
  placeOrder,
  sendWebhook,
  signedWebhook,
  sleep,
  sqlOne,
  STORE_ID,
  customers,
} from '../lib/harness.mjs';
import { orderStatus, paidFlowStart, runIfMain, setStock, stockRow } from '../lib/flows.mjs';

async function waitFor(fn, timeoutMs = 130_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(2000);
  }
  return false;
}

export async function run() {
  const out = [];
  const admin = await adminLogin('super_admin');
  const before = (await http('GET', '/admin/settings', { token: admin.accessToken })).body;
  const patch = await http('PATCH', '/admin/settings', {
    token: admin.accessToken,
    body: { order_expiry_minutes: 5 },
  });

  const s = new Scenario('C-EXP-1', 'Commande non payée → expired : stock et créneau libérés');
  s.expect('réglage order_expiry_minutes=5 accepté', 200, patch.status);
  const s2 = new Scenario(
    'C-EXP-2',
    'Commande payment_failed → expired ; paiement en attente → expired',
  );
  const s3 = new Scenario(
    'C-EXP-3',
    'Paiement réussi sur commande expirée : payment.unexpected_success, aucune production',
  );
  try {
    setStock('col-indigo', 'M', 1, 0);
    const slot = makeSlot(1);
    // A : dernière unité + dernier créneau, jamais payée
    const a = await paidFlowStart({
      colorId: 'col-indigo',
      size: 'M',
      slotId: slot,
      payerPhone: '+22890000003',
    });
    // B : paiement échoué (webhook failed)
    setStock('col-indigo', 'L', 1, 0);
    const slotB = makeSlot(1);
    const b = await paidFlowStart({
      colorId: 'col-indigo',
      size: 'L',
      slotId: slotB,
      payerPhone: '+22890000000',
    });
    await sendWebhook(
      signedWebhook({ ref: b.ref, paymentId: b.paymentId, amount: b.amount, status: 'failed' }),
    );

    const delay = sqlOne(
      `SELECT round(extract(epoch FROM (expires_at - created_at))/60) FROM orders WHERE id='${a.orderId}'`,
    );
    s.expect('expires_at = création + 5 min (réglage appliqué)', '5', delay);
    s.expect('avant expiration : stock 1/1', '1/1', stockRow('col-indigo', 'M'));
    s.expect(
      'avant expiration : 2e client refusé (OUT_OF_STOCK)',
      [409, 'OUT_OF_STOCK'],
      await (async () => {
        const [c] = await customers(1);
        await fillCart(c.token, { colorId: 'col-indigo', size: 'M', qty: 1 });
        const r = await placeOrder(c.token, {
          reception: { type: 'pickup', storeId: STORE_ID(), slotId: makeSlot(5) },
        });
        return [r.status, r.body?.error?.code];
      })(),
    );
    s.expect(
      'avant expiration : créneau complet pour un autre client (SLOT_FULL)',
      [409, 'SLOT_FULL'],
      await (async () => {
        const [c] = await customers(1);
        await fillCart(c.token, { colorId: 'col-blanc', size: 'XL', qty: 1 });
        const r = await placeOrder(c.token, {
          reception: { type: 'pickup', storeId: STORE_ID(), slotId: slot },
        });
        return [r.status, r.body?.error?.code];
      })(),
    );
    s.expect(
      'créneau A réservé (1/1)',
      ['1', '1'],
      s.control('créneau', `SELECT booked, capacity FROM pickup_slots WHERE id='${slot}'`)[0],
    );
    s2.expect('B est payment_failed', 'payment_failed', orderStatus(b.orderId));

    if (process.env.REAL_WAIT !== '1') {
      sql2(
        `UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id IN ('${a.orderId}','${b.orderId}')`,
      );
      s.note(
        'Accélération de test : expires_at avancé en SQL (l’échéance à +5 min a été vérifiée juste avant).',
      );
    }
    const done = await waitFor(
      () => orderStatus(a.orderId) === 'expired' && orderStatus(b.orderId) === 'expired',
      REAL(),
    );
    s.expectTrue(
      'A et B passent en expired par le worker (≤ 130 s)',
      done,
      `A=${orderStatus(a.orderId)} B=${orderStatus(b.orderId)}`,
    );
    s.expect('A : stock libéré (1/0)', '1/0', stockRow('col-indigo', 'M'));
    s.expect(
      'A : créneau libéré (0/1)',
      ['0', '1'],
      s.control('créneau', `SELECT booked, capacity FROM pickup_slots WHERE id='${slot}'`)[0],
    );
    s.expect(
      'A : mouvements reserve puis release',
      [
        ['reserve', '1'],
        ['release', '1'],
      ],
      s.control(
        'mouvements A',
        `SELECT type, sum(quantity) FROM stock_movements WHERE order_id='${a.orderId}' GROUP BY type ORDER BY min(created_at)`,
      ),
    );
    s.expect(
      'A : historique par le système',
      ['pending_payment', 'expired', 'system'],
      s.control(
        'historique A',
        `SELECT from_status, to_status, actor_type FROM order_status_history WHERE order_id='${a.orderId}' AND to_status='expired'`,
      )[0],
    );
    s.expect(
      'A : aucun pickup résiduel',
      '0',
      s.control(
        'pickups',
        `SELECT count(*) FROM pickups p WHERE p.order_id='${a.orderId}' AND p.slot_id='${slot}'`,
      )[0][0],
    );
    s.expect(
      'A : paiement pending → expired',
      'expired',
      sqlOne(`SELECT status FROM payments WHERE id='${a.paymentId}'`),
    );
    s2.expect('B : expired depuis payment_failed', 'expired', orderStatus(b.orderId));
    s2.expect('B : stock libéré (1/0)', '1/0', stockRow('col-indigo', 'L'));
    s2.expect(
      'B : créneau libéré (0)',
      '0',
      sqlOne(`SELECT booked FROM pickup_slots WHERE id='${slotB}'`),
    );

    // Le stock et le créneau libérés sont de nouveau achetables
    const [c2] = await customers(1);
    await fillCart(c2.token, { colorId: 'col-indigo', size: 'M', qty: 1 });
    const again = await placeOrder(c2.token, {
      reception: { type: 'pickup', storeId: STORE_ID(), slotId: slot },
    });
    s.expect(
      'un nouveau client obtient la dernière unité et le créneau libérés',
      201,
      again.status,
    );

    // Succès tardif sur A (expirée)
    const w = await sendWebhook(
      signedWebhook({ ref: a.ref, paymentId: a.paymentId, amount: a.amount }),
    );
    s3.expect('webhook de succès sur commande expirée : 200', 200, w.status);
    s3.expect('commande reste expired (jamais payée)', 'expired', orderStatus(a.orderId));
    s3.expect(
      'outcome unexpected_success',
      'unexpected_success',
      sqlOne(
        `SELECT outcome FROM payment_events WHERE provider_ref='${a.ref}' ORDER BY received_at DESC LIMIT 1`,
      ),
    );
    s3.expect(
      'paiement tracé succeeded + order_not_payable (remboursement manuel)',
      ['succeeded', 'order_not_payable'],
      s3.control(
        'paiement',
        `SELECT status, failure_reason FROM payments WHERE id='${a.paymentId}'`,
      )[0],
    );
    s3.expect(
      'aucune sortie de stock pour A',
      '0',
      s3.control(
        'out',
        `SELECT count(*) FROM stock_movements WHERE order_id='${a.orderId}' AND type='out'`,
      )[0][0],
    );
    s3.expect(
      'aucun job de production',
      '0',
      s3.control(
        'production',
        `SELECT count(*) FROM production_jobs WHERE order_id='${a.orderId}'`,
      )[0][0],
    );
    await sleep(2500);
    s3.expect(
      'alerte équipe payment.unexpected_success en file / envoyée',
      true,
      Number(
        sqlOne(
          `SELECT count(*) FROM notifications WHERE template_key='payment.unexpected_success' AND created_at > now() - interval '10 minutes'`,
        ),
      ) >= 1,
    );
  } finally {
    await http('PATCH', '/admin/settings', {
      token: admin.accessToken,
      body: { order_expiry_minutes: before.order_expiry_minutes ?? 30 },
    });
  }
  out.push(
    s.finish('coherence-exp-1.json'),
    s2.finish('coherence-exp-2.json'),
    s3.finish('coherence-exp-3.json'),
  );
  return out;
}

import { sql } from '../lib/harness.mjs';
const sql2 = sql;
const REAL = () => (process.env.REAL_WAIT === '1' ? 400_000 : 130_000);
await runIfMain(import.meta.url, run);
