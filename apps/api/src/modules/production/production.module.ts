import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ENV, type Env } from '../../config/env';
import { EVENTS, type OrderStatusChangedEvent } from '../../common/events';
import { MEDIA_PROVIDER, type MediaProvider } from '../../media/media-provider';
import { OrdersModule } from '../orders/orders.module';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { ASSET_LOADER, MediaAssetLoader } from './render/asset-loader';
import { PrintFilesService } from './render/print-files.service';
import { BullRenderQueue, RENDER_QUEUE, type RenderQueue } from './render/render.queue';
import { LocalStorageAdapter } from './storage/local-storage.adapter';
import { S3StorageAdapter } from './storage/s3-storage.adapter';
import { STORAGE_PROVIDER, type StorageProvider } from './storage/storage-provider';

@Injectable()
export class ProductionListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProductionListener.name);

  constructor(
    private readonly production: ProductionService,
    @Inject(RENDER_QUEUE) private readonly queue: RenderQueue,
  ) {}

  onModuleInit(): void {
    this.production.registerChecks();
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close?.();
  }

  @OnEvent(EVENTS.orderStatusChanged, { suppressErrors: false })
  async onStatusChanged(e: OrderStatusChangedEvent): Promise<void> {
    try {
      if (e.to === 'paid' || e.to === 'deposit_paid') await this.production.onPaid(e.orderId);
      else if (e.to === 'ready') await this.production.onReady(e.orderId);
    } catch {
      this.logger.error(`Traitement production en échec (commande ${e.number})`);
    }
  }
}

@Module({
  imports: [OrdersModule],
  controllers: [ProductionController],
  providers: [
    ProductionService,
    PrintFilesService,
    ProductionListener,
    {
      provide: RENDER_QUEUE,
      inject: [ENV],
      useFactory: (env: Env): RenderQueue => new BullRenderQueue(env.REDIS_URL),
    },
    {
      provide: STORAGE_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): StorageProvider =>
        env.STORAGE_PROVIDER === 's3'
          ? new S3StorageAdapter({
              bucket: env.S3_BUCKET,
              region: env.S3_REGION,
              endpoint: env.S3_ENDPOINT,
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            })
          : new LocalStorageAdapter(env.STORAGE_LOCAL_DIR, env.STORAGE_BASE_URL, env.JWT_SECRET),
    },
    {
      provide: ASSET_LOADER,
      inject: [ENV, MEDIA_PROVIDER],
      useFactory: (env: Env, media: MediaProvider) =>
        new MediaAssetLoader(media, env.ASSET_CACHE_DIR),
    },
  ],
  exports: [ProductionService, PrintFilesService],
})
export class ProductionModule {}
