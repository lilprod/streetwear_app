// Routes et rôles attendus, transcrits de docs/contrat-api.md (section « Routes back-office » et « Routes livreur »).
// Transcription manuelle : « GET / POST / PATCH /admin/x » du contrat est développé en GET /admin/x, POST /admin/x, PATCH /admin/x/:id.
const S = 'super_admin';
const OM = 'order_manager';
const P = 'production';
const L = 'logistics';
const C = 'courier';

const rows = [
  [['GET'], '/admin/orders', [OM, P, L, S]],
  [['GET'], '/admin/orders/:id', [OM, P, L, S]],
  [['GET'], '/admin/orders/counts', [OM, P, L, S]],
  [['POST'], '/admin/orders/:id/transitions', [OM, P, L, S]], // « selon la transition » : contrôle par transition hors périmètre de la matrice de routes
  [['POST'], '/admin/orders/:id/assign-operator', [P, S]],
  [['GET'], '/admin/orders/:id/production-sheet.pdf', [P, S]],
  [['GET'], '/admin/operators', [P, S]],
  [['GET'], '/admin/production/queue', [P, S]],
  [['GET'], '/admin/order-items/:id/print-files', [P, S]],
  [['POST'], '/admin/order-items/:id/print-files/regenerate', [P, S]],
  [['GET', 'POST'], '/admin/delivery-zones', [L, S]],
  [['PATCH'], '/admin/delivery-zones/:id', [L, S]],
  [['GET'], '/admin/deliveries', [L, S]],
  [['POST'], '/admin/deliveries/:id/assign', [L, S]],
  [['GET'], '/admin/couriers', [L, S]],
  [['GET', 'POST'], '/admin/stores', [L, S]],
  [['PATCH'], '/admin/stores/:id', [L, S]],
  [['GET', 'POST'], '/admin/stores/:id/slots', [L, S]],
  [['PATCH'], '/admin/stores/:id/slots/:slotId', [L, S]],
  [['GET'], '/admin/stock', [P, S]],
  [['POST'], '/admin/stock/movements', [P, S]],
  [['PATCH'], '/admin/stock/:id', [P, S]],
  ...['patterns', 'pattern-categories', 'colors', 'fonts'].flatMap((x) => [
    [['GET', 'POST'], `/admin/${x}`, [S]],
    [['PATCH'], `/admin/${x}/:id`, [S]],
  ]),
  // Le contrat écrit « GET / POST / PATCH /admin/price-rules » sans :id ; les règles sont identifiées par `key`, PATCH sur la collection.
  [['GET', 'POST', 'PATCH'], '/admin/price-rules', [S]],
  [['GET', 'POST'], '/admin/banned-words', [S]],
  [['DELETE'], '/admin/banned-words/:id', [S]],
  [['POST'], '/admin/media/upload-signature', [S]],
  [['GET'], '/admin/payments', [OM, S]],
  [['GET'], '/admin/reconciliations', [OM, S]],
  [['GET', 'POST'], '/admin/users', [S]],
  [['PATCH'], '/admin/users/:id', [S]],
  [['GET'], '/admin/audit-logs', [S]],
  [['GET', 'PATCH'], '/admin/settings', [S]],
  [['GET', 'PATCH'], '/admin/notification-templates', [S]],
  [['GET'], '/admin/stats/summary', [OM, S]],
  [['GET'], '/courier/deliveries', [C]],
  [['POST'], '/courier/deliveries/:id/start', [C]],
  [['POST'], '/courier/deliveries/:id/complete', [C]],
  [['POST'], '/courier/deliveries/:id/fail', [C]],
];

export const CONTRACT = rows.flatMap(([methods, path, roles]) =>
  methods.map((method) => ({ method, path, roles })),
);

/** Routes publiques du contrat sous /admin (authentification et réception d'upload signée). */
export const CONTRACT_PUBLIC = [
  ['POST', '/admin/auth/login'],
  ['POST', '/admin/auth/totp'],
  ['POST', '/admin/auth/refresh'],
  ['POST', '/admin/auth/logout'],
  ['POST', '/admin/media/upload'], // décrite dans la prose du contrat (réception locale signée), absente des tableaux
];
