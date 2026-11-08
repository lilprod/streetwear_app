import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ORDER_STATUS_LABELS_FR } from '@streetwear/shared';
import { Button } from '../../components/button';
import { useToast } from '../../components/toast';
import { fr } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { getPrintFiles, regeneratePrintFiles, type AdminOrder } from '../../lib/orders-api';

const LINK_TTL_MS = 14 * 60 * 1000;
type Links = { front?: string; back?: string };

function ItemFiles({ itemId, label }: { itemId: string; label: string }) {
  const toast = useToast();
  const [links, setLinks] = useState<Links | null>(null);

  useEffect(() => {
    if (!links) return;
    const t = setTimeout(() => setLinks(null), LINK_TTL_MS);
    return () => clearTimeout(t);
  }, [links]);

  const fetchLinks = useMutation({
    mutationFn: () => getPrintFiles(itemId),
    gcTime: 0,
    onSuccess: setLinks,
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });
  const regenerate = useMutation({
    mutationFn: () => regeneratePrintFiles(itemId),
    onSuccess: () => {
      setLinks(null);
      toast.show(fr['production.regenerating'], 'success');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const empty = links && !links.front && !links.back;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {links && (
          <p className="mt-1 flex flex-wrap gap-3 text-sm">
            {links.front && (
              <a
                href={links.front}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${fr['production.front']} — ${label}`}
                className="underline underline-offset-2"
              >
                {fr['production.front']}
              </a>
            )}
            {links.back && (
              <a
                href={links.back}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${fr['production.back']} — ${label}`}
                className="underline underline-offset-2"
              >
                {fr['production.back']}
              </a>
            )}
            {empty && <span className="text-inkSecondary">{fr['production.noFiles']}</span>}
            {!empty && (
              <span className="text-xs text-inkSecondary">{fr['production.linksValid']}</span>
            )}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={fetchLinks.isPending}
          aria-label={`${fr['production.getLinks']} — ${label}`}
          onClick={() => fetchLinks.mutate()}
        >
          {fr['production.getLinks']}
        </Button>
        <Button
          variant="secondary"
          disabled={regenerate.isPending}
          aria-label={`${fr['production.regenerate']} — ${label}`}
          onClick={() => regenerate.mutate()}
        >
          {fr['production.regenerate']}
        </Button>
      </div>
    </li>
  );
}

export function PrintFilesPanel({ order, onClose }: { order: AdminOrder; onClose?: () => void }) {
  return (
    <section
      aria-label={`${fr['production.filesFor']} ${order.number}`}
      className="mt-6 rounded-admin-lg border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {fr['production.filesFor']} <span className="font-mono">{order.number}</span>
          <span className="ml-2 text-sm font-normal text-inkSecondary">
            {ORDER_STATUS_LABELS_FR[order.status]}
          </span>
        </h2>
        {onClose && (
          <Button variant="secondary" onClick={onClose}>
            {fr['production.close']}
          </Button>
        )}
      </div>
      <ul className="mt-2">
        {order.items.map((it, i) => (
          <ItemFiles
            key={it.id}
            itemId={it.id}
            label={`${i + 1}. ${it.colorId} · ${it.size} · ×${it.quantity}`}
          />
        ))}
      </ul>
    </section>
  );
}
