export const PRODUCTION_EVENTS = {
  renderFailed: 'production.render_failed',
} as const;

/** Alerte à la production (SP07 y branchera la notification) ; aucune donnée personnelle. */
export interface RenderFailedEvent {
  orderId: string;
  orderItemId: string;
  orderNumber: string;
  code: string;
  message: string;
}
