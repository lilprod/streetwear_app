// C-WH : webhooks rejoués, simultanés et falsifiés.
import {
  Scenario,
  countBy,
  http,
  sendWebhook,
  signedWebhook,
  sleep,
  sql,
  sqlOne,
} from '../lib/harness.mjs';
import { orderStatus, paidFlowStart, runIfMain, setStock, stockRow } from '../lib/flows.mjs';

const events = (ref) =>
  `SELECT outcome, signature_valid FROM payment_events WHERE provider_ref='${ref}' ORDER BY received_at`;

export async function run() {
  const out = [];

  // 1. Rejeu ×3
  const s1 = new Scenario(
    'C-WH-1',
    'Webhook de succès rejoué 3 fois : une seule transition, un seul mouvement de stock',
  );
  {
    setStock('col-noir', 'XL', 10, 0);
    const f = await paidFlowStart({ colorId: 'col-noir', size: 'XL' });
    const hook = signedWebhook({ ref: f.ref, paymentId: f.paymentId, amount: f.amount });
    const res = [];
    for (let i = 0; i < 3; i += 1) res.push(await sendWebhook(hook));
    s1.expect(
      '3 réponses 200',
      [200, 200, 200],
      res.map((r) => r.status),
    );
    s1.expect('commande payée', 'paid', orderStatus(f.orderId));
    s1.expect(
      'stock : 9 en rayon, 0 réservé (reserve → out une fois)',
      '9/0',
      stockRow('col-noir', 'XL'),
    );
    s1.expect(
      'événements enregistrés (aucun perdu)',
      [
        ['processed', 't'],
        ['duplicate', 't'],
        ['duplicate', 't'],
      ],
      s1.control('payment_events', events(f.ref)),
    );
    s1.expect(
      'un seul mouvement out, un seul reserve',
      [
        ['reserve', '1'],
        ['out', '1'],
      ],
      s1.control(
        'mouvements',
        `SELECT type, sum(quantity) FROM stock_movements WHERE order_id='${f.orderId}' GROUP BY type ORDER BY type`,
      ),
    );
    s1.expect(
      'une seule transition vers paid',
      '1',
      s1.control(
        'historique',
        `SELECT count(*) FROM order_status_history WHERE order_id='${f.orderId}' AND to_status='paid'`,
      )[0][0],
    );
    await sleep(2500);
    s1.expect(
      'un seul job de production',
      '1',
      s1.control(
        'production_jobs',
        `SELECT count(*) FROM production_jobs WHERE order_id='${f.orderId}'`,
      )[0][0],
    );
    s1.expect(
      'un seul paiement réussi',
      ['succeeded', '1'],
      s1.control(
        'payments',
        `SELECT status, count(*) FROM payments WHERE order_id='${f.orderId}' GROUP BY status`,
      )[0],
    );
  }
  out.push(s1.finish('coherence-wh-1.json'));

  // 2. Simultanés ×10
  const s2 = new Scenario('C-WH-2', '10 webhooks identiques simultanés : un seul traité');
  {
    setStock('col-noir', 'L', 10, 0);
    const f = await paidFlowStart({ colorId: 'col-noir', size: 'L' });
    const hook = signedWebhook({ ref: f.ref, paymentId: f.paymentId, amount: f.amount });
    const res = await Promise.all(Array.from({ length: 10 }, () => sendWebhook(hook)));
    s2.expect('10 réponses 200', 10, res.filter((r) => r.status === 200).length);
    const rows = s2.control('payment_events', events(f.ref));
    s2.expect(
      '1 processed + 9 duplicate',
      { processed: 1, duplicate: 9 },
      countBy(rows, (r) => r[0]),
    );
    s2.expect('commande payée', 'paid', orderStatus(f.orderId));
    s2.expect('stock 9/0', '9/0', stockRow('col-noir', 'L'));
    s2.expect(
      'un seul mouvement out',
      '1',
      s2.control(
        'out',
        `SELECT count(*) FROM stock_movements WHERE order_id='${f.orderId}' AND type='out'`,
      )[0][0],
    );
  }
  out.push(s2.finish('coherence-wh-2.json'));

  // 3. Falsifiés
  const s3 = new Scenario(
    'C-WH-3',
    'Webhooks falsifiés : signature, corps modifié, montant, fournisseur, JSON',
  );
  {
    const f = await paidFlowStart({ colorId: 'col-blanc', size: 'M' });
    const good = signedWebhook({ ref: f.ref, paymentId: f.paymentId, amount: f.amount });
    const wrongSecret = signedWebhook({
      ref: f.ref,
      paymentId: f.paymentId,
      amount: f.amount,
      secret: 'x'.repeat(40),
    });
    const r1 = await sendWebhook(wrongSecret);
    s3.expect(
      'mauvais secret : 401 UNAUTHENTICATED',
      [401, 'UNAUTHENTICATED'],
      [r1.status, r1.body?.error?.code],
    );
    const tampered = {
      body: good.body.replace(`"amount":${f.amount}`, '"amount":1'),
      headers: good.headers,
    };
    const r2 = await sendWebhook(tampered);
    s3.expect('corps modifié après signature : 401', 401, r2.status);
    const r3 = await sendWebhook({
      body: good.body,
      headers: { 'content-type': 'application/json' },
    });
    s3.expect('signature absente : 401', 401, r3.status);
    const r4 = await sendWebhook({
      body: good.body,
      headers: { ...good.headers, 'x-fake-signature': 'zz' },
    });
    s3.expect('signature mal formée : 401', 401, r4.status);
    const r5 = await http('POST', '/webhooks/payments/inconnu', {
      raw: good.body,
      headers: good.headers,
    });
    s3.expect('agrégateur inconnu : 404', 404, r5.status);
    s3.expect(
      'commande toujours en attente après 5 rejets',
      'pending_payment',
      orderStatus(f.orderId),
    );
    s3.expect(
      'aucune sortie de stock',
      '0',
      s3.control(
        'out',
        `SELECT count(*) FROM stock_movements WHERE order_id='${f.orderId}' AND type='out'`,
      )[0][0],
    );
    s3.expect(
      'les 4 rejets portant la référence sont conservés (rejected, signature invalide) ; le 5e (agrégateur inconnu) l’est sans référence',
      [
        ['rejected', 'f'],
        ['rejected', 'f'],
        ['rejected', 'f'],
        ['rejected', 'f'],
      ],
      s3.control('événements rejetés', events(f.ref)),
    );

    // montant : signature valide mais montant ≠ dû
    const low = signedWebhook({ ref: f.ref, paymentId: f.paymentId, amount: 1 });
    const r6 = await sendWebhook(low);
    s3.expect('montant 1 XOF signé : 200 (accusé) mais non crédité', 200, r6.status);
    s3.expect('commande NON payée', 'pending_payment', orderStatus(f.orderId));
    s3.expect(
      'paiement échoué pour amount_mismatch',
      ['failed', 'amount_mismatch'],
      s3.control(
        'paiement',
        `SELECT status, failure_reason FROM payments WHERE id='${f.paymentId}'`,
      )[0],
    );
    s3.expect(
      'événement amount_mismatch enregistré',
      'amount_mismatch',
      sqlOne(
        `SELECT outcome FROM payment_events WHERE provider_ref='${f.ref}' AND signature_valid ORDER BY received_at DESC LIMIT 1`,
      ),
    );
    await sleep(1500);
    s3.expect(
      'alerte équipe créée (payment.amount_mismatch)',
      true,
      Number(
        sqlOne(
          `SELECT count(*) FROM notifications WHERE template_key='payment.amount_mismatch' AND created_at > now() - interval '2 minutes'`,
        ),
      ) >= 1,
    );

    // montant supérieur
    const g = await paidFlowStart({ colorId: 'col-blanc', size: 'M' });
    const hi = signedWebhook({ ref: g.ref, paymentId: g.paymentId, amount: g.amount + 1000 });
    await sendWebhook(hi);
    s3.expect('montant supérieur : commande NON payée', 'pending_payment', orderStatus(g.orderId));

    // référence inconnue, JSON invalide signé, devise erronée
    const unk = signedWebhook({
      ref: 'fk_inexistant',
      paymentId: '00000000-0000-4000-8000-000000000001',
      amount: 11000,
    });
    const r7 = await sendWebhook(unk);
    s3.expect('référence inconnue : 200 et ignorée', 200, r7.status);
    s3.expect(
      'outcome unknown_payment',
      'unknown_payment',
      sqlOne(
        `SELECT outcome FROM payment_events WHERE provider_ref='fk_inexistant' ORDER BY received_at DESC LIMIT 1`,
      ),
    );
    const bad = signedWebhook({
      ref: g.ref,
      paymentId: g.paymentId,
      amount: g.amount,
      currency: 'EUR',
    });
    await sendWebhook(bad);
    s3.expect('devise EUR : commande NON payée', 'pending_payment', orderStatus(g.orderId));
    const junk = '{"pas":"un webhook"';
    const { createHmac } = await import('node:crypto');
    const { WEBHOOK_SECRET } = await import('../lib/harness.mjs');
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(junk).digest('hex');
    const r8 = await http('POST', '/webhooks/payments/fake', {
      raw: junk,
      headers: { 'content-type': 'application/json', 'x-fake-signature': sig },
    });
    s3.expect('JSON invalide mais signé : 200 sans effet (malformed)', 200, r8.status);
    s3.expect(
      'outcome malformed',
      'malformed',
      sqlOne(`SELECT outcome FROM payment_events ORDER BY received_at DESC LIMIT 1`),
    );

    // paiement échoué rejoué ensuite par un succès (ordre inversé)
    const h = await paidFlowStart({ colorId: 'col-blanc', size: 'M', payerPhone: '+22890000000' });
    await sendWebhook(
      signedWebhook({ ref: h.ref, paymentId: h.paymentId, amount: h.amount, status: 'failed' }),
    );
    s3.expect(
      'échec fournisseur : commande payment_failed',
      'payment_failed',
      orderStatus(h.orderId),
    );
    await sendWebhook(
      signedWebhook({ ref: h.ref, paymentId: h.paymentId, amount: h.amount, status: 'succeeded' }),
    );
    s3.expect(
      'succès tardif sur paiement déjà échoué : ignoré (duplicate), commande reste payment_failed',
      'payment_failed',
      orderStatus(h.orderId),
    );
    s3.note(
      'Succès tardif après échec : le paiement terminal « failed » n’est pas rouvert ; si le client a réellement été débité, seul le rapprochement quotidien (reconciliation.mismatch) le révèle.',
    );
  }
  out.push(s3.finish('coherence-wh-3.json'));
  return out;
}
await runIfMain(import.meta.url, run);
void sql;
