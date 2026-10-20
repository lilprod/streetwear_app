import type { AdminRole } from '@streetwear/shared';
import type { FrKey } from '../i18n/fr';

export type ModuleId =
  | 'dashboard'
  | 'orders'
  | 'production'
  | 'deliveries'
  | 'pickup'
  | 'stock'
  | 'catalog'
  | 'payments'
  | 'team'
  | 'courier';

export type AppModule = {
  id: ModuleId;
  path: string;
  labelKey: FrKey;
  roles: readonly AdminRole[];
};

export const MODULES: readonly AppModule[] = [
  {
    id: 'dashboard',
    path: '/',
    labelKey: 'nav.dashboard',
    roles: ['order_manager', 'super_admin'],
  },
  {
    id: 'orders',
    path: '/commandes',
    labelKey: 'nav.orders',
    roles: ['order_manager', 'production', 'logistics', 'super_admin'],
  },
  {
    id: 'production',
    path: '/production',
    labelKey: 'nav.production',
    roles: ['production', 'super_admin'],
  },
  {
    id: 'deliveries',
    path: '/livraisons',
    labelKey: 'nav.deliveries',
    roles: ['logistics', 'super_admin'],
  },
  { id: 'pickup', path: '/retrait', labelKey: 'nav.pickup', roles: ['logistics', 'super_admin'] },
  { id: 'stock', path: '/stock', labelKey: 'nav.stock', roles: ['production', 'super_admin'] },
  { id: 'catalog', path: '/catalogue', labelKey: 'nav.catalog', roles: ['super_admin'] },
  {
    id: 'payments',
    path: '/paiements',
    labelKey: 'nav.payments',
    roles: ['order_manager', 'super_admin'],
  },
  { id: 'team', path: '/equipe', labelKey: 'nav.team', roles: ['super_admin'] },
  { id: 'courier', path: '/livreur', labelKey: 'nav.courier', roles: ['courier'] },
];

export const modulesFor = (role: AdminRole): AppModule[] =>
  MODULES.filter((m) => m.roles.includes(role));

export const homePath = (role: AdminRole): string => modulesFor(role)[0]?.path ?? '/403';
