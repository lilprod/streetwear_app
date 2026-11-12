import type { Order, OrderStatus } from '@streetwear/shared';
import type { ApiClient } from '../../api/types';
import { getStorage } from '../../storage';

/** Numéro WhatsApp de la marque : configurable (`EXPO_PUBLIC_WHATSAPP_NUMBER`), jamais figé dans le code. */
export const brandWhatsapp = (): string | null => {
  const digits = (process.env.EXPO_PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
};

export const whatsappUrl = (digits: string, message: string): string =>
  `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

const UNPAID: readonly OrderStatus[] = [
  'pending_payment',
  'payment_failed',
  'expired',
  'cancelled',
];

export const hasReceipt = (status: OrderStatus): boolean => !UNPAID.includes(status);

export const isFinal = (status: OrderStatus): boolean =>
  ['delivered', 'expired', 'cancelled', 'refunded', 'returned'].includes(status);

export const needsPayment = (status: OrderStatus): boolean =>
  status === 'pending_payment' || status === 'payment_failed';

export type ReceiptDeps = {
  write: (name: string, bytes: Uint8Array) => Promise<string>;
  share: (uri: string) => Promise<void>;
};

export function defaultReceiptDeps(): ReceiptDeps {
  return {
    write: async (name, bytes) => {
      const { File, Paths } = await import('expo-file-system');
      const file = new File(Paths.cache, name);
      file.create({ overwrite: true });
      await file.write(bytes);
      return file.uri;
    },
    share: async (uri) => {
      const Sharing = await import('expo-sharing');
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    },
  };
}

/** Télécharge le reçu avec la session (jeton Bearer) puis l'ouvre via la feuille de partage système. */
export async function openReceipt(
  api: ApiClient,
  order: Pick<Order, 'id' | 'number'>,
  deps: ReceiptDeps = defaultReceiptDeps(),
): Promise<void> {
  const bytes = await api.getReceiptPdf(order.id);
  const uri = await deps.write(`recu-${order.number}.pdf`, bytes);
  await deps.share(uri);
}

export const readCodeStorage = () => getStorage();
