export const ORDER_STATUSES = [
  'pending_payment',
  'payment_failed',
  'expired',
  'paid',
  'deposit_paid',
  'in_production',
  'ready',
  'shipped',
  'ready_for_pickup',
  'delivered',
  'delivery_failed',
  'returned',
  'cancelled',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ADMIN_ROLES = [
  'super_admin',
  'order_manager',
  'production',
  'logistics',
  'courier',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type ReceptionType = 'home' | 'pickup';

export type OrderActor =
  | { type: 'system' }
  | { type: 'provider' }
  | { type: 'customer' }
  | { type: 'admin'; role: AdminRole };

export type OrderActorType = OrderActor['type'];

export type Precondition =
  'requiresOperator' | 'requiresPrintFiles' | 'requiresCourier' | 'requiresHandoverCode';

export type TransitionRule = {
  from: OrderStatus;
  to: OrderStatus;
  /** Acteurs non-admin autorisés. */
  actors: readonly Exclude<OrderActorType, 'admin'>[];
  /** Rôles admin autorisés (liste exacte, pas de surcharge implicite par super_admin). */
  roles: readonly AdminRole[];
  preconditions: readonly Precondition[];
  /** Type de réception exigé, le cas échéant. */
  receptionType?: ReceptionType;
};

const rule = (
  from: OrderStatus,
  to: OrderStatus,
  who: {
    actors?: TransitionRule['actors'];
    roles?: readonly AdminRole[];
    preconditions?: readonly Precondition[];
    receptionType?: ReceptionType;
  },
): TransitionRule => ({
  from,
  to,
  actors: who.actors ?? [],
  roles: who.roles ?? [],
  preconditions: who.preconditions ?? [],
  ...(who.receptionType ? { receptionType: who.receptionType } : {}),
});

const CANCEL_ROLES: readonly AdminRole[] = ['order_manager', 'super_admin'];

export const ORDER_TRANSITIONS: readonly TransitionRule[] = [
  rule('pending_payment', 'paid', { actors: ['provider'] }),
  rule('pending_payment', 'deposit_paid', { actors: ['provider'] }),
  rule('pending_payment', 'payment_failed', { actors: ['provider'] }),
  rule('pending_payment', 'expired', { actors: ['system'] }),
  rule('pending_payment', 'cancelled', { roles: CANCEL_ROLES }),
  rule('payment_failed', 'pending_payment', { actors: ['customer'] }),
  rule('paid', 'in_production', { roles: ['production'], preconditions: ['requiresOperator'] }),
  rule('paid', 'cancelled', { roles: CANCEL_ROLES }),
  rule('deposit_paid', 'in_production', {
    roles: ['production'],
    preconditions: ['requiresOperator'],
  }),
  rule('deposit_paid', 'cancelled', { roles: CANCEL_ROLES }),
  rule('in_production', 'ready', { roles: ['production'], preconditions: ['requiresPrintFiles'] }),
  rule('ready', 'shipped', {
    roles: ['logistics'],
    preconditions: ['requiresCourier'],
    receptionType: 'home',
  }),
  rule('ready', 'ready_for_pickup', { roles: ['logistics'], receptionType: 'pickup' }),
  rule('shipped', 'delivered', {
    roles: ['courier'],
    preconditions: ['requiresHandoverCode'],
    receptionType: 'home',
  }),
  rule('shipped', 'delivery_failed', { roles: ['courier'], receptionType: 'home' }),
  rule('ready_for_pickup', 'delivered', {
    roles: ['logistics'],
    preconditions: ['requiresHandoverCode'],
    receptionType: 'pickup',
  }),
  rule('delivery_failed', 'shipped', {
    roles: ['logistics'],
    preconditions: ['requiresCourier'],
  }),
  rule('delivery_failed', 'returned', { roles: ['logistics'] }),
  rule('cancelled', 'refunded', { roles: ['super_admin'] }),
  rule('returned', 'refunded', { roles: ['super_admin'] }),
];

export type TransitionContext = { receptionType?: ReceptionType };

export function getTransition(from: OrderStatus, to: OrderStatus): TransitionRule | undefined {
  return ORDER_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

function actorAllowed(t: TransitionRule, actor: OrderActor): boolean {
  return actor.type === 'admin' ? t.roles.includes(actor.role) : t.actors.includes(actor.type);
}

function contextAllowed(t: TransitionRule, ctx?: TransitionContext): boolean {
  return !t.receptionType || !ctx?.receptionType || ctx.receptionType === t.receptionType;
}

/**
 * Vrai si la transition existe, si l'acteur y est autorisé et (quand `context.receptionType` est
 * fourni) si le type de réception correspond. Les préconditions se vérifient via `unmetPreconditions`.
 */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: OrderActor,
  context?: TransitionContext,
): boolean {
  const t = getTransition(from, to);
  return !!t && actorAllowed(t, actor) && contextAllowed(t, context);
}

export function allowedTransitions(
  from: OrderStatus,
  actor: OrderActor,
  context?: TransitionContext,
): OrderStatus[] {
  return ORDER_TRANSITIONS.filter(
    (t) => t.from === from && actorAllowed(t, actor) && contextAllowed(t, context),
  ).map((t) => t.to);
}

export type PreconditionFacts = Partial<Record<Precondition, boolean>>;

/** Préconditions de la transition non satisfaites (absentes de `facts` = non satisfaites). */
export function unmetPreconditions(
  from: OrderStatus,
  to: OrderStatus,
  facts: PreconditionFacts,
): Precondition[] {
  const t = getTransition(from, to);
  return (t?.preconditions ?? []).filter((p) => facts[p] !== true);
}

export const ORDER_STATUS_LABELS_FR: Record<OrderStatus, string> = {
  pending_payment: 'En attente de paiement',
  payment_failed: 'Paiement échoué',
  expired: 'Expirée',
  paid: 'Payée',
  deposit_paid: 'Acompte payé',
  in_production: 'En production',
  ready: 'Prête',
  shipped: 'Expédiée',
  ready_for_pickup: 'Prête au retrait',
  delivered: 'Livrée',
  delivery_failed: 'Livraison échouée',
  returned: 'Retournée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

export type CustomerTimelineStep = {
  key: 'paid' | 'in_production' | 'ready' | 'dispatch' | 'delivered';
  labelFr: string;
  statuses: readonly OrderStatus[];
};

/** Étapes affichées au client : Payée > En production > Prête > Expédiée / Prête au retrait > Livrée. */
export const CUSTOMER_TIMELINE: readonly CustomerTimelineStep[] = [
  { key: 'paid', labelFr: 'Payée', statuses: ['paid', 'deposit_paid'] },
  { key: 'in_production', labelFr: 'En production', statuses: ['in_production'] },
  { key: 'ready', labelFr: 'Prête', statuses: ['ready'] },
  {
    key: 'dispatch',
    labelFr: 'Expédiée / Prête au retrait',
    statuses: ['shipped', 'ready_for_pickup', 'delivery_failed'],
  },
  { key: 'delivered', labelFr: 'Livrée', statuses: ['delivered'] },
];

/** Index de l'étape client atteinte, ou -1 (hors parcours : attente de paiement, annulée…). */
export function customerTimelineIndex(status: OrderStatus): number {
  return CUSTOMER_TIMELINE.findIndex((s) => s.statuses.includes(status));
}
