import { createTransport } from 'nodemailer';
import { gsm7Length, toGsm7 } from '../src/modules/notifications/gsm7';
import { SmtpEmailProvider } from '../src/modules/notifications/providers/email.provider';
import {
  EXPO_RECEIPT_BATCH,
  EXPO_SEND_BATCH,
  ExpoPushProvider,
  type FetchLike,
} from '../src/modules/notifications/providers/expo-push.provider';
import {
  SPEC_BY_KEY,
  TEMPLATE_DEFAULTS,
  TEMPLATE_SPECS,
  render,
  smsWorstLength,
  validateTemplate,
} from '../src/modules/notifications/templates';

const def = <T>(v: T | undefined | null): T => {
  if (v === undefined || v === null) throw new Error('valeur attendue');
  return v;
};

const EMOJI = /\p{Extended_Pictographic}/u;

describe('modèles par défaut', () => {
  it('couvre chaque clé de la fiche avec ses canaux', () => {
    const has = (key: string, channel: string) =>
      TEMPLATE_DEFAULTS.some((t) => t.key === key && t.channel === channel);
    for (const key of ['order.paid', 'order.ready_for_pickup', 'order.shipped']) {
      expect(has(key, 'push')).toBe(true);
      expect(has(key, 'sms')).toBe(true);
    }
    for (const key of [
      'order.in_production',
      'order.delivered',
      'order.payment_failed',
      'order.expired',
    ]) {
      expect(has(key, 'push')).toBe(true);
      expect(has(key, 'sms')).toBe(false);
    }
    for (const key of [
      'stock.below_threshold',
      'production.render_failed',
      'payment.amount_mismatch',
      'payment.unexpected_success',
      'reconciliation.mismatch',
    ]) {
      expect(has(key, 'email')).toBe(true);
    }
  });

  it('ne contient que des variables autorisées et aucun code dans un titre', () => {
    for (const t of TEMPLATE_DEFAULTS) {
      const spec = SPEC_BY_KEY.get(t.key);
      expect(spec).toBeDefined();
      expect(validateTemplate(def(spec), t.channel, t.title, t.body)).toEqual([]);
    }
  });

  it.each(TEMPLATE_DEFAULTS.filter((t) => t.channel === 'sms').map((t) => [t.key, t] as const))(
    'SMS %s : GSM-7, sans emoji, <= 160 septets avec des valeurs maximales',
    (_key, t) => {
      const spec = def(SPEC_BY_KEY.get(t.key));
      const rendered = render(t.body, spec.max);
      expect(EMOJI.test(rendered)).toBe(false);
      const gsm = toGsm7(rendered);
      expect(gsm).not.toBeNull();
      expect(gsm7Length(def(gsm))).toBeLessThanOrEqual(160);
      expect(smsWorstLength(spec, t.body)).toBeLessThanOrEqual(160);
    },
  );

  it('rend les variables d’exemple', () => {
    const spec = def(SPEC_BY_KEY.get('order.paid'));
    expect(render('{{orderNumber}} / {{ brand }}', spec.sample)).toBe('TG-000123 / Streetwear');
    expect(TEMPLATE_SPECS.length).toBeGreaterThan(10);
  });
});

describe('GSM-7 et validation', () => {
  it('simplifie les accents hors jeu et refuse les emoji', () => {
    expect(toGsm7('prête, ça va ? l’app')).toBe("prete, ca va ? l'app");
    expect(toGsm7('Merci é è ù à')).toBe('Merci é è ù à');
    expect(toGsm7('Bravo 🎉')).toBeNull();
    expect(gsm7Length('[a]')).toBe(5);
  });

  it('refuse variables inconnues, codes en titre, SMS non GSM-7 ou trop long', () => {
    const paid = def(SPEC_BY_KEY.get('order.paid'));
    const pickup = def(SPEC_BY_KEY.get('order.ready_for_pickup'));
    expect(validateTemplate(paid, 'push', 'T', '{{nope}}')).toEqual([
      { reason: 'UNKNOWN_VARIABLE', variables: ['nope'] },
    ]);
    expect(validateTemplate(paid, 'push', 'T', '{{pickupCode}}')[0]).toMatchObject({
      reason: 'UNKNOWN_VARIABLE',
    });
    expect(validateTemplate(pickup, 'push', '{{pickupCode}}', 'x')[0]).toMatchObject({
      reason: 'CODE_IN_TITLE',
    });
    expect(validateTemplate(paid, 'push', 'T', 'Bonjour {{orderNumber')).toContainEqual({
      reason: 'MALFORMED_PLACEHOLDER',
    });
    expect(validateTemplate(paid, 'sms', null, 'Bravo 🎉')).toContainEqual({
      reason: 'SMS_NOT_GSM7',
    });
    expect(
      validateTemplate(paid, 'sms', null, 'a'.repeat(150) + ' {{orderNumber}}'),
    ).toContainEqual({ reason: 'SMS_TOO_LONG', length: 161, max: 160 });
  });
});

describe('ExpoPushProvider (HTTP simulé)', () => {
  const messages = (n: number) =>
    Array.from({ length: n }, (_v, i) => ({ to: `ExpoToken-${i}`, title: 'T', body: 'B' }));

  it('envoie par lots de 100 et traduit les tickets', async () => {
    const calls: { url: string; size: number; auth?: string }[] = [];
    const fetchFn: FetchLike = async (url, init) => {
      const body = JSON.parse(init.body) as { to: string }[];
      calls.push({ url, size: body.length, auth: init.headers.authorization });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: body.map((m, i) =>
            m.to === 'ExpoToken-7'
              ? { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } }
              : { status: 'ok', id: `tk-${calls.length}-${i}` },
          ),
        }),
      };
    };
    const tickets = await new ExpoPushProvider('secret-token', fetchFn).send(messages(250));
    expect(EXPO_SEND_BATCH).toBe(100);
    expect(calls.map((c) => c.size)).toEqual([100, 100, 50]);
    expect(calls.every((c) => c.url === 'https://exp.host/--/api/v2/push/send')).toBe(true);
    expect(calls[0]?.auth).toBe('Bearer secret-token');
    expect(tickets).toHaveLength(250);
    expect(tickets[7]).toEqual({ to: 'ExpoToken-7', ok: false, error: 'DeviceNotRegistered' });
    expect(tickets[8]).toMatchObject({ ok: true });
  });

  it('lève sur une erreur HTTP ou une réponse incohérente (le job sera rejoué)', async () => {
    const down: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await expect(new ExpoPushProvider('', down).send(messages(1))).rejects.toThrow('EXPO_HTTP_503');
    const odd: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });
    await expect(new ExpoPushProvider('', odd).send(messages(1))).rejects.toThrow(
      'EXPO_BAD_RESPONSE',
    );
  });

  it('lit les reçus par lots de 1000', async () => {
    const sizes: number[] = [];
    const fetchFn: FetchLike = async (url, init) => {
      expect(url.endsWith('/getReceipts')).toBe(true);
      const { ids } = JSON.parse(init.body) as { ids: string[] };
      sizes.push(ids.length);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: Object.fromEntries(
            ids.map((id) => [
              id,
              id === 'r-3'
                ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
                : { status: 'ok' },
            ]),
          ),
        }),
      };
    };
    const ids = Array.from({ length: 2500 }, (_v, i) => `r-${i}`);
    const out = await new ExpoPushProvider('', fetchFn).receipts(ids);
    expect(EXPO_RECEIPT_BATCH).toBe(1000);
    expect(sizes).toEqual([1000, 1000, 500]);
    expect(out['r-3']).toEqual({ ok: false, error: 'DeviceNotRegistered' });
    expect(out['r-4']).toEqual({ ok: true });
  });
});

describe('SmtpEmailProvider (transport JSON, aucun réseau)', () => {
  it('envoie le message avec l’expéditeur configuré', async () => {
    const transport = createTransport({ jsonTransport: true });
    const provider = new SmtpEmailProvider('smtp://unused', 'Alertes <a@example.com>', transport);
    const sent = jest.spyOn(transport, 'sendMail');
    await provider.send({ to: 'prod@example.com', subject: 'Sujet', text: 'Corps' });
    expect(sent).toHaveBeenCalledWith({
      from: 'Alertes <a@example.com>',
      to: 'prod@example.com',
      subject: 'Sujet',
      text: 'Corps',
    });
  });
});
