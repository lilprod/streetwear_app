import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as Sentry from '@sentry/node';
import { DesignSpecSchema, ZONE_NAMES, type Zone, type ZoneName } from '@streetwear/shared';
import { uuidv7 } from '../../../common/uuid';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { PRODUCTION_EVENTS, type RenderFailedEvent } from '../production.events';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider';
import { ASSET_LOADER, type AssetLoader } from './asset-loader';
import { RenderError, renderZone, type RenderAssets } from './render-zone';

export const printFileKey = (orderId: string, orderNumber: string, index: number, zone: ZoneName) =>
  `print-files/${orderId}/${orderNumber}_${index}_${zone}.png`;

const COLUMN = { front: 'printFileFrontUrl', back: 'printFileBackUrl' } as const;

@Injectable()
export class PrintFilesService {
  private readonly logger = new Logger(PrintFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(ASSET_LOADER) private readonly assets: AssetLoader,
  ) {}

  /** Point d'entrée de la file : ne lève jamais (échec = job `failed` + alerte), la file continue. */
  async process(orderItemId: string): Promise<void> {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      select: { orderId: true, order: { select: { number: true } } },
    });
    if (!item) return;
    try {
      await this.markRendering(item.orderId);
      await this.renderItem(orderItemId);
      await this.refreshJobStatus(item.orderId);
    } catch (e) {
      const code = e instanceof RenderError ? e.code : 'RENDER_FAILED';
      const message = e instanceof RenderError ? e.message : 'Erreur inattendue pendant le rendu.';
      await this.markFailed(item.orderId, `${code}: ${message}`);
      const payload: RenderFailedEvent = {
        orderId: item.orderId,
        orderItemId,
        orderNumber: item.order.number,
        code,
        message,
      };
      this.events.emit(PRODUCTION_EVENTS.renderFailed, payload);
      this.logger.error(`Rendu HD en échec (commande ${item.order.number}, ${code})`);
      Sentry.captureMessage(`Rendu HD en échec : ${code}`, {
        level: 'error',
        tags: { orderNumber: item.order.number },
      });
    }
  }

  /** Rend et stocke les fichiers d'une ligne ; rejouable (même clé = fichier écrasé). */
  async renderItem(orderItemId: string): Promise<void> {
    const item = await this.prisma.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
      include: {
        order: {
          select: { id: true, number: true, items: { select: { id: true, createdAt: true } } },
        },
      },
    });
    const parsed = DesignSpecSchema.safeParse(item.designSnapshot);
    if (!parsed.success) throw new RenderError('ASSET_INVALID', 'Design de la ligne invalide.');
    const spec = parsed.data;
    const index =
      [...item.order.items]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
        .findIndex((i) => i.id === item.id) + 1;

    const layers = ZONE_NAMES.flatMap((n) => spec.zones[n]?.layers ?? []);
    const assets = await this.loadAssets(layers);
    const zoneSizes = await this.settings.get('print_zones');

    const data: Partial<Record<(typeof COLUMN)[ZoneName], string>> = {};
    for (const name of ZONE_NAMES) {
      const zone: Zone | undefined = spec.zones[name];
      if (!zone || zone.layers.length === 0) continue;
      const png = await renderZone(zone, assets, 300, zoneSizes[name]);
      const key = printFileKey(item.order.id, item.order.number, index, name);
      await this.storage.put(key, png, 'image/png');
      data[COLUMN[name]] = key;
    }
    await this.prisma.orderItem.update({ where: { id: item.id }, data });
  }

  private async loadAssets(layers: readonly { type: string }[]): Promise<RenderAssets> {
    const typed = layers as readonly (
      { type: 'pattern'; patternId: string } | { type: 'text'; fontId: string }
    )[];
    const patternIds = [
      ...new Set(typed.flatMap((l) => (l.type === 'pattern' ? [l.patternId] : []))),
    ];
    const fontIds = [...new Set(typed.flatMap((l) => (l.type === 'text' ? [l.fontId] : [])))];
    const [patterns, fonts] = await Promise.all([
      this.prisma.pattern.findMany({
        where: { id: { in: patternIds } },
        select: { id: true, imagePublicId: true },
      }),
      this.prisma.font.findMany({
        where: { id: { in: fontIds } },
        select: { id: true, filePublicId: true },
      }),
    ]);
    const out: { patterns: Record<string, Buffer>; fonts: Record<string, Buffer> } = {
      patterns: {},
      fonts: {},
    };
    for (const id of patternIds) {
      const row = patterns.find((p) => p.id === id);
      if (!row) throw new RenderError('PATTERN_ASSET_MISSING', `Motif ${id} introuvable.`);
      out.patterns[id] = await this.assets.loadPattern(row.imagePublicId);
    }
    for (const id of fontIds) {
      const row = fonts.find((f) => f.id === id);
      if (!row) throw new RenderError('FONT_ASSET_MISSING', `Police ${id} introuvable.`);
      out.fonts[id] = await this.assets.loadFont(row.filePublicId);
    }
    return out;
  }

  private async lockJob(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    orderId: string,
  ) {
    await tx.$executeRaw`INSERT INTO production_jobs (id, order_id, status, created_at, updated_at)
      VALUES (${uuidv7()}::uuid, ${orderId}::uuid, 'queued', now(), now())
      ON CONFLICT (order_id) DO NOTHING`;
    const [row] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM production_jobs WHERE order_id = ${orderId}::uuid FOR UPDATE`;
    return row?.status ?? 'queued';
  }

  private async markRendering(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const status = await this.lockJob(tx, orderId);
      if (status === 'queued') {
        await tx.productionJob.update({ where: { orderId }, data: { status: 'rendering' } });
      }
    });
  }

  private async markFailed(orderId: string, error: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockJob(tx, orderId);
      await tx.productionJob.update({
        where: { orderId },
        data: { status: 'failed', error: error.slice(0, 500) },
      });
    });
  }

  /** `ready_to_print` quand toutes les lignes ont leurs fichiers (verrou sur le travail). */
  async refreshJobStatus(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const status = await this.lockJob(tx, orderId);
      if (status === 'printed') return;
      const items = await tx.orderItem.findMany({ where: { orderId } });
      const complete = items.every((i) => {
        const spec = DesignSpecSchema.safeParse(i.designSnapshot);
        if (!spec.success) return false;
        const front = (spec.data.zones.front?.layers.length ?? 0) > 0;
        const back = (spec.data.zones.back?.layers.length ?? 0) > 0;
        return (!front || !!i.printFileFrontUrl) && (!back || !!i.printFileBackUrl);
      });
      if (complete) {
        await tx.productionJob.update({
          where: { orderId },
          data: { status: 'ready_to_print', error: null },
        });
      }
    });
  }
}
