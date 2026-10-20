import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLES,
  CUSTOMER_TIMELINE,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS_FR,
  ORDER_TRANSITIONS,
  allowedTransitions,
  canTransition,
  customerTimelineIndex,
  getTransition,
  unmetPreconditions,
  type OrderActor,
} from './index';

const admin = (role: (typeof ADMIN_ROLES)[number]): OrderActor => ({ type: 'admin', role });
const ALL_ACTORS: OrderActor[] = [
  { type: 'system' },
  { type: 'provider' },
  { type: 'customer' },
  ...ADMIN_ROLES.map(admin),
];

describe('transition table', () => {
  it.each(ORDER_TRANSITIONS.map((t) => [t.from, t.to, t] as const))(
    '%s -> %s: allowed for listed actors only',
    (from, to, t) => {
      const ctx = t.receptionType ? { receptionType: t.receptionType } : undefined;
      for (const actor of ALL_ACTORS) {
        const expected =
          actor.type === 'admin'
            ? t.roles.length > 0 && (actor.role === 'super_admin' || t.roles.includes(actor.role))
            : t.actors.includes(actor.type);
        expect(canTransition(from, to, actor, ctx)).toBe(expected);
      }
    },
  );

  it('forbids every pair that is not in the table, for every actor', () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        if (getTransition(from, to)) continue;
        for (const actor of ALL_ACTORS) expect(canTransition(from, to, actor)).toBe(false);
      }
    }
  });

  it('matches the documented graph exactly', () => {
    const pairs = ORDER_TRANSITIONS.map((t) => `${t.from}>${t.to}`).sort();
    expect(pairs).toEqual(
      [
        'pending_payment>paid',
        'pending_payment>deposit_paid',
        'pending_payment>payment_failed',
        'pending_payment>expired',
        'pending_payment>cancelled',
        'payment_failed>pending_payment',
        'paid>in_production',
        'paid>cancelled',
        'deposit_paid>in_production',
        'deposit_paid>cancelled',
        'in_production>ready',
        'ready>shipped',
        'ready>ready_for_pickup',
        'shipped>delivered',
        'shipped>delivery_failed',
        'ready_for_pickup>delivered',
        'delivery_failed>shipped',
        'delivery_failed>returned',
        'cancelled>refunded',
        'returned>refunded',
      ].sort(),
    );
  });

  it('has no transition out of terminal states and no cancel after production starts', () => {
    for (const s of ['expired', 'delivered', 'refunded'] as const) {
      expect(ORDER_TRANSITIONS.some((t) => t.from === s)).toBe(false);
    }
    expect(canTransition('in_production', 'cancelled', admin('super_admin'))).toBe(false);
  });

  it('lets super_admin do any team transition but none reserved to provider, system or customer', () => {
    const sa = admin('super_admin');
    expect(canTransition('in_production', 'ready', sa)).toBe(true);
    expect(canTransition('shipped', 'delivered', sa, { receptionType: 'home' })).toBe(true);
    expect(canTransition('pending_payment', 'paid', sa)).toBe(false);
    expect(canTransition('pending_payment', 'expired', sa)).toBe(false);
    expect(canTransition('payment_failed', 'pending_payment', sa)).toBe(false);
  });

  it('requires the matching reception type when the transition depends on it', () => {
    const l = admin('logistics');
    expect(canTransition('ready', 'shipped', l, { receptionType: 'home' })).toBe(true);
    expect(canTransition('ready', 'shipped', l, { receptionType: 'pickup' })).toBe(false);
    expect(canTransition('ready', 'ready_for_pickup', l, { receptionType: 'pickup' })).toBe(true);
    expect(canTransition('ready', 'ready_for_pickup', l, { receptionType: 'home' })).toBe(false);
    expect(canTransition('ready', 'ready_for_pickup', l, {})).toBe(false);
    expect(canTransition('ready', 'shipped', l)).toBe(false);
    expect(
      canTransition('paid', 'in_production', admin('production'), { receptionType: 'home' }),
    ).toBe(true);
  });
});

describe('allowedTransitions', () => {
  it('lists targets per actor', () => {
    expect(allowedTransitions('pending_payment', { type: 'provider' })).toEqual([
      'paid',
      'deposit_paid',
      'payment_failed',
    ]);
    expect(allowedTransitions('ready', admin('logistics'), { receptionType: 'home' })).toEqual([
      'shipped',
    ]);
    expect(allowedTransitions('ready', admin('logistics'))).toEqual([]);
    expect(allowedTransitions('ready', admin('logistics'), { receptionType: 'pickup' })).toEqual([
      'ready_for_pickup',
    ]);
    expect(allowedTransitions('ready', admin('courier'))).toEqual([]);
    expect(allowedTransitions('paid', admin('order_manager'))).toEqual(['cancelled']);
  });
});

describe('preconditions', () => {
  it('names the unmet ones', () => {
    expect(unmetPreconditions('paid', 'in_production', {})).toEqual(['requiresOperator']);
    expect(unmetPreconditions('paid', 'in_production', { requiresOperator: true })).toEqual([]);
    expect(unmetPreconditions('in_production', 'ready', {})).toEqual(['requiresPrintFiles']);
    expect(unmetPreconditions('ready', 'shipped', { requiresCourier: false })).toEqual([
      'requiresCourier',
    ]);
    expect(unmetPreconditions('shipped', 'delivered', {})).toEqual(['requiresHandoverCode']);
    expect(unmetPreconditions('ready', 'ready_for_pickup', {})).toEqual([]);
    expect(unmetPreconditions('paid', 'refunded', {})).toEqual([]);
  });
});

describe('labels and timeline', () => {
  it('labels every status in French', () => {
    for (const s of ORDER_STATUSES) expect(ORDER_STATUS_LABELS_FR[s].length).toBeGreaterThan(0);
    expect(ORDER_STATUS_LABELS_FR.in_production).toBe('En production');
  });
  it('orders customer steps and maps statuses', () => {
    expect(CUSTOMER_TIMELINE.map((s) => s.labelFr)).toEqual([
      'Payée',
      'En production',
      'Prête',
      'Expédiée / Prête au retrait',
      'Livrée',
    ]);
    expect(customerTimelineIndex('deposit_paid')).toBe(0);
    expect(customerTimelineIndex('ready_for_pickup')).toBe(3);
    expect(customerTimelineIndex('delivered')).toBe(4);
    expect(customerTimelineIndex('cancelled')).toBe(-1);
  });
});
