import { http, HttpResponse } from 'msw';
import { uid } from '@streetwear/shared';
import type { AdminPayment, Reconciliation } from '@streetwear/shared';
import { guardRole, MANAGERS, pageOf } from './admin-guard';

const PAYMENTS: AdminPayment[] = [
  {
    id: uid(1101),
    orderId: uid(1201),
    orderNumber: 'SW-2026-0101',
    provider: 'demo-agregateur',
    method: 'tmoney',
    kind: 'full',
    amountXof: 12000,
    status: 'succeeded',
    providerRef: 'TM-0001',
    payerPhone: '+228 90 •• •• 56',
    failureReason: null,
    confirmedAt: '2026-11-10T09:12:00.000Z',
    createdAt: '2026-11-10T09:11:00.000Z',
  },
  {
    id: uid(1102),
    orderId: uid(1202),
    orderNumber: 'SW-2026-0102',
    provider: 'demo-agregateur',
    method: 'flooz',
    kind: 'deposit',
    amountXof: 6000,
    status: 'succeeded',
    providerRef: 'FL-0002',
    payerPhone: '+228 91 •• •• 14',
    failureReason: null,
    confirmedAt: '2026-11-10T11:02:00.000Z',
    createdAt: '2026-11-10T11:01:00.000Z',
  },
  {
    id: uid(1103),
    orderId: uid(1203),
    orderNumber: 'SW-2026-0103',
    provider: 'demo-agregateur',
    method: 'card',
    kind: 'full',
    amountXof: 15500,
    status: 'failed',
    providerRef: 'CD-0003',
    payerPhone: null,
    failureReason: 'Carte refusée',
    confirmedAt: null,
    createdAt: '2026-11-11T08:30:00.000Z',
  },
  {
    id: uid(1104),
    orderId: uid(1204),
    orderNumber: 'SW-2026-0104',
    provider: 'demo-agregateur',
    method: 'tmoney',
    kind: 'balance',
    amountXof: 6000,
    status: 'pending',
    providerRef: null,
    payerPhone: '+228 92 •• •• 77',
    failureReason: null,
    confirmedAt: null,
    createdAt: '2026-11-11T10:00:00.000Z',
  },
  {
    id: uid(1105),
    orderId: uid(1205),
    orderNumber: 'SW-2026-0105',
    provider: 'demo-agregateur',
    method: 'flooz',
    kind: 'full',
    amountXof: 9000,
    status: 'refunded',
    providerRef: 'FL-0005',
    payerPhone: '+228 90 •• •• 23',
    failureReason: null,
    confirmedAt: '2026-11-09T16:45:00.000Z',
    createdAt: '2026-11-09T16:44:00.000Z',
  },
];

const RECONCILIATIONS: Reconciliation[] = [
  {
    id: uid(1301),
    date: '2026-11-11',
    provider: 'demo-agregateur',
    matched: 14,
    mismatchCount: 0,
    mismatches: [],
    createdAt: '2026-11-11T23:30:00.000Z',
  },
  {
    id: uid(1302),
    date: '2026-11-10',
    provider: 'demo-agregateur',
    matched: 11,
    mismatchCount: 3,
    mismatches: [
      {
        type: 'amount_mismatch',
        providerRef: 'TM-0001',
        paymentId: uid(1101),
        orderNumber: 'SW-2026-0101',
        providerStatus: 'SUCCESS',
        paymentStatus: 'succeeded',
        providerAmountXof: 12500,
        paymentAmountXof: 12000,
      },
      {
        type: 'missing_at_provider',
        providerRef: 'TM-0099',
        paymentId: uid(1199),
        orderNumber: 'SW-2026-0099',
        providerStatus: null,
        paymentStatus: 'succeeded',
        providerAmountXof: null,
        paymentAmountXof: 4500,
      },
      {
        type: 'status_mismatch',
        providerRef: 'FL-0002',
        paymentId: uid(1102),
        orderNumber: 'SW-2026-0102',
        providerStatus: 'FAILED',
        paymentStatus: 'succeeded',
        providerAmountXof: 6000,
        paymentAmountXof: 6000,
      },
    ],
    createdAt: '2026-11-10T23:30:00.000Z',
  },
];

export const paymentsHandlers = [
  http.get('*/v1/admin/payments', ({ request }) => {
    const denied = guardRole(request, MANAGERS);
    if (denied) return denied;
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const rows = PAYMENTS.filter(
      (p) =>
        (!status || p.status === status) &&
        (!from || p.createdAt >= from) &&
        (!to || p.createdAt <= to),
    );
    return HttpResponse.json(
      pageOf(rows, url.searchParams.get('cursor'), Number(url.searchParams.get('limit') ?? 20)),
    );
  }),
  http.get('*/v1/admin/reconciliations', ({ request }) => {
    const denied = guardRole(request, MANAGERS);
    if (denied) return denied;
    const url = new URL(request.url);
    return HttpResponse.json(
      pageOf(
        RECONCILIATIONS,
        url.searchParams.get('cursor'),
        Number(url.searchParams.get('limit') ?? 20),
      ),
    );
  }),
];
