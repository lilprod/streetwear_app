// C-PAY : double paiement (même clé, clés différentes, deux succès fournisseur).
import {
  Scenario,
  countBy,
  pay,
  sendWebhook,
  signedWebhook,
  sleep,
  sql,
  sqlOne,
  uuid,
} from '../lib/harness.mjs';
import {
  orderForNewCustomer,
  orderStatus,
  paidFlowStart,
  runIfMain,
  setStock,
  stockRow,
} from '../lib/flows.mjs';

export async function run() {
  const out = [];

  const s1 = new Scenario(
    'C-PAY-1',
    'Même Idempotency-Key ×5 en parallèle : un seul paiement initié',
  );
  {
    const o = await orderForNewCustomer({ colorId: 'col-sable', size: 'S' });
    const key = uuid();
    const res = await Promise.all(
      Array.from({ length: 5 }, () => pay(o.c.token, o.orderId, { key })),
    );
    s1.expect(
      'réponses 201 identiques',
      1,
      new Set(res.map((r) => `${r.status}:${r.body?.paymentId}`)).size,
    );
    s1.expect('statut 201', 201, res[0].status);
    s1.expect(
      'une ligne payments',
      '1',
      s1.control('payments', `SELECT count(*) FROM payments WHERE order_id='${o.orderId}'`)[0][0],
    );
    const other = await pay(o.c.token, o.orderId, { key, payerPhone: '+22890000022' });
    s1.expect(
      'même clé, corps différent : 409 IDEMPOTENCY_CONFLICT',
      [409, 'IDEMPOTENCY_CONFLICT'],
      [other.status, other.body?.error?.code],
    );
  }
  out.push(s1.finish('coherence-pay-1.json'));

  const s2 = new Scenario(
    'C-PAY-2',
    'Clés différentes ×5 en parallèle : un seul paiement en cours (anti double débit)',
  );
  {
    const o = await orderForNewCustomer({ colorId: 'col-sable', size: 'S' });
    const res = await Promise.all(Array.from({ length: 5 }, () => pay(o.c.token, o.orderId)));
    const by = countBy(res, (r) => r.status);
    s2.expect('1 créé, 4 refusés', { 201: 1, 409: 4 }, { 201: by[201] ?? 0, 409: by[409] ?? 0 });
    s2.expect(
      'raison des refus',
      ['payment_pending'],
      [...new Set(res.filter((r) => r.status === 409).map((r) => r.body?.error?.details?.reason))],
    );
    s2.expect(
      'une ligne payments pending',
      [['pending', '1']],
      s2.control(
        'payments',
        `SELECT status, count(*) FROM payments WHERE order_id='${o.orderId}' GROUP BY status`,
      ),
    );
  }
  out.push(s2.finish('coherence-pay-2.json'));

  const s3 = new Scenario(
    'C-PAY-3',
    'Paiement sur commande déjà payée refusé ; clé neuve, même commande',
  );
  {
    const f = await paidFlowStart({ colorId: 'col-sable', size: 'S' });
    await sendWebhook(signedWebhook({ ref: f.ref, paymentId: f.paymentId, amount: f.amount }));
    const r = await pay(f.c.token, f.orderId);
    s3.expect('409 ORDER_NOT_PAYABLE', [409, 'ORDER_NOT_PAYABLE'], [r.status, r.body?.error?.code]);
    s3.expect(
      'un seul paiement en base',
      '1',
      s3.control('payments', `SELECT count(*) FROM payments WHERE order_id='${f.orderId}'`)[0][0],
    );
    const replay = await pay(f.c.token, f.orderId, {
      key: sqlOne(`SELECT idempotency_key FROM payments WHERE id='${f.paymentId}'`),
    });
    s3.expect(
      'rejeu de la clé d’origine : même réponse (pas de nouveau débit)',
      [201, f.paymentId],
      [replay.status, replay.body?.paymentId],
    );
  }
  out.push(s3.finish('coherence-pay-3.json'));

  const s4 = new Scenario(
    'C-PAY-4',
    'Deux paiements (clés différentes, >2 min d’écart) qui réussissent tous deux chez l’agrégateur',
  );
  {
    setStock('col-sable', 'XS', 10, 0);
    const f = await paidFlowStart({ colorId: 'col-sable', size: 'XS', payerPhone: '+22890000003' });
    s4.note(
      'Premier paiement en scénario never_approved (getStatus reste pending) : sans cela le filet getStatus (>60 s) confirme le premier paiement et refuse le second, ce qui est le comportement sûr.',
    );
    sql(`UPDATE payments SET created_at = now() - interval '3 minutes' WHERE id='${f.paymentId}'`);
    const second = await pay(f.c.token, f.orderId, { payerPhone: '+22890000033' });
    s4.expect('second paiement accepté après 2 min', 201, second.status);
    s4.expect(
      'premier paiement passé en expired (superseded)',
      'expired',
      sqlOne(`SELECT status FROM payments WHERE id='${f.paymentId}'`),
    );
    const ref2 = sqlOne(`SELECT provider_ref FROM payments WHERE id='${second.body.paymentId}'`);
    await sendWebhook(signedWebhook({ ref: f.ref, paymentId: f.paymentId, amount: f.amount }));
    s4.expect('commande payée par le premier succès', 'paid', orderStatus(f.orderId));
    const w2 = await sendWebhook(
      signedWebhook({ ref: ref2, paymentId: second.body.paymentId, amount: second.body.amountXof }),
    );
    s4.expect('second succès : 200', 200, w2.status);
    s4.expect(
      'commande toujours payée, une seule fois',
      '1',
      s4.control(
        'transitions paid',
        `SELECT count(*) FROM order_status_history WHERE order_id='${f.orderId}' AND to_status='paid'`,
      )[0][0],
    );
    s4.expect('stock sorti une seule fois (9/0)', '9/0', stockRow('col-sable', 'XS'));
    s4.expect(
      'second paiement tracé : succeeded + order_not_payable (à rembourser)',
      ['succeeded', 'order_not_payable'],
      s4.control(
        'payments',
        `SELECT status, failure_reason FROM payments WHERE id='${second.body.paymentId}'`,
      )[0],
    );
    s4.expect(
      'événement unexpected_success',
      'unexpected_success',
      sqlOne(
        `SELECT outcome FROM payment_events WHERE provider_ref='${ref2}' ORDER BY received_at DESC LIMIT 1`,
      ),
    );
    await sleep(2000);
    s4.expect(
      'alerte e-mail payment.unexpected_success créée pour l’équipe',
      true,
      Number(
        sqlOne(
          `SELECT count(*) FROM notifications WHERE template_key='payment.unexpected_success' AND created_at > now() - interval '2 minutes'`,
        ),
      ) >= 1,
    );
  }
  out.push(s4.finish('coherence-pay-4.json'));
  return out;
}
await runIfMain(import.meta.url, run);
