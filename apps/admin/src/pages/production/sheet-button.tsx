import { useState } from 'react';
import { Button } from '../../components/button';
import { useToast } from '../../components/toast';
import { fr } from '../../i18n/fr';
import { apiBlob } from '../../lib/api';
import { errorMessage } from '../../lib/errors';

export function SheetButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    const tab = window.open('about:blank', '_blank');
    setBusy(true);
    try {
      const blob = await apiBlob(`/admin/orders/${orderId}/production-sheet.pdf`);
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.show(fr['production.sheetOpened'], 'success');
    } catch (e) {
      tab?.close();
      toast.show(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="secondary"
      disabled={busy}
      aria-label={`${fr['production.sheet']} ${orderNumber}`}
      onClick={() => void open()}
    >
      {fr['production.sheet']}
    </Button>
  );
}
