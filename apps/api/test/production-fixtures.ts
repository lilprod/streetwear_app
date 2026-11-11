import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DesignSpec, Size } from '@streetwear/shared';
import { VALID_DESIGNS } from '@streetwear/shared';
import { uuidv7 } from '../src/common/uuid';
import { ProductionService } from '../src/modules/production/production.service';
import { ASSET_LOADER, type AssetLoader } from '../src/modules/production/render/asset-loader';
import { PrintFilesService } from '../src/modules/production/render/print-files.service';
import { RENDER_QUEUE, type RenderQueue } from '../src/modules/production/render/render.queue';
import { RenderError } from '../src/modules/production/render/render-zone';
import { LocalStorageAdapter } from '../src/modules/production/storage/local-storage.adapter';
import { STORAGE_PROVIDER } from '../src/modules/production/storage/storage-provider';
import { OrdersService } from '../src/modules/orders/orders.service';
import type { AppOptions } from './helpers';
import { ordersCtx } from './orders-fixtures';
import { TEST_FONT, patternPng } from './render-fixtures';

export class RecordingQueue implements RenderQueue {
  readonly ids: string[] = [];
  enqueue(orderItemId: string): Promise<void> {
    if (!this.ids.includes(orderItemId)) this.ids.push(orderItemId);
    return Promise.resolve();
  }
}

export class FakeAssetLoader implements AssetLoader {
  readonly missing = new Set<string>();
  loads = 0;
  loadPattern(publicId: string): Promise<Buffer> {
    this.loads++;
    if (this.missing.has(publicId)) {
      return Promise.reject(
        new RenderError('PATTERN_ASSET_MISSING', `Motif ${publicId} introuvable.`),
      );
    }
    return Promise.resolve(patternPng(600));
  }
  loadFont(): Promise<Buffer> {
    return Promise.resolve(TEST_FONT);
  }
}

export async function waitFor<T>(fn: () => Promise<T | undefined | false>, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor: délai dépassé');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** App complète avec file, stockage et motifs factices (aucun réseau). */
export async function productionCtx(extra?: AppOptions['configure']) {
  const queue = new RecordingQueue();
  const assets = new FakeAssetLoader();
  const dir = mkdtempSync(join(tmpdir(), 'sw-print-'));
  const storage = new LocalStorageAdapter(dir, 'http://storage.test', 'test-secret');
  const t = await ordersCtx({
    configure: (b) => {
      const base = b
        .overrideProvider(RENDER_QUEUE)
        .useValue(queue)
        .overrideProvider(ASSET_LOADER)
        .useValue(assets)
        .overrideProvider(STORAGE_PROVIDER)
        .useValue(storage);
      return extra ? extra(base) : base;
    },
  });
  const orders = t.app.get(OrdersService);
  const printFiles = t.app.get(PrintFilesService);
  const production = t.app.get(ProductionService);

  /** Commande avec une ligne par design de `bases`, payée (événement émis après validation). */
  async function paidOrder(
    opts: { bases?: string[]; method?: 'tmoney' | 'cod'; pay?: boolean; size?: Size } = {},
  ) {
    const bases = opts.bases ?? ['patternOnly'];
    const size = opts.size ?? 'M';
    await t.setStock('col-noir', size, 1000);
    const s = await t.shopper({ size, base: bases[0] });
    for (const base of bases.slice(1)) {
      const d = await t.design(s.auth, t.withColor('col-noir', base));
      await t.addToCart(s.auth, d.id, size, 1);
    }
    const res = await t
      .placeOrder(s.auth, {
        reception: { type: 'home', addressId: s.addressId },
        paymentMethod: opts.method ?? 'tmoney',
      })
      .expect(201);
    const id = res.body.id as string;
    if (opts.pay !== false) {
      await orders.runInTransaction((tx) =>
        orders.applyPaymentResult(
          id,
          { succeeded: true, kind: opts.method === 'cod' ? 'deposit' : 'full' },
          tx,
        ),
      );
    }
    const items = await t.prisma.orderItem.findMany({
      where: { orderId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { id, number: res.body.number as string, items };
  }

  const job = (orderId: string) => t.prisma.productionJob.findUnique({ where: { orderId } });
  const newId = uuidv7;
  return {
    ...t,
    queue,
    assets,
    storage,
    dir,
    orders,
    printFiles,
    production,
    paidOrder,
    job,
    newId,
  };
}

export type ProductionCtx = Awaited<ReturnType<typeof productionCtx>>;
export const DESIGN_KEYS = Object.keys(VALID_DESIGNS) as (keyof typeof VALID_DESIGNS)[];
export type { DesignSpec };
